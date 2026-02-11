import fs from "node:fs";
import path from "node:path";
import { docker } from "./dockerService.js";
import { getRawIntegrationConfig, saveIntegrations } from "./settingsService.js";
import { HttpError } from "../lib/httpError.js";
import {
  appendTaskLog,
  cloneFailedTaskAsRetry,
  createAppTask,
  getAppTaskById,
  getTaskLogs,
  listAppTasks,
  markTaskFailed,
  markTaskRunning,
  markTaskSuccess,
  updateAppTask
} from "./appTaskService.js";
import { writeAudit } from "./auditService.js";
import { config } from "../config.js";

const APP_DEFINITIONS = {
  jellyfin: {
    id: "jellyfin",
    name: "Jellyfin",
    containerName: "arknas-jellyfin",
    image: "jellyfin/jellyfin:latest",
    category: "媒体",
    description: "媒体库管理与播放服务",
    openPortKey: "jellyfinHostPort",
    openPath: "/"
  },
  qbittorrent: {
    id: "qbittorrent",
    name: "qBittorrent",
    containerName: "arknas-qbittorrent",
    image: "lscr.io/linuxserver/qbittorrent:latest",
    category: "下载",
    description: "BT 下载与做种管理",
    openPortKey: "qbWebPort",
    openPath: "/"
  },
  portainer: {
    id: "portainer",
    name: "Portainer",
    containerName: "arknas-portainer",
    image: "portainer/portainer-ce:latest",
    category: "运维",
    description: "容器可视化管理",
    openPortKey: "portainerHostPort",
    openPath: "/"
  },
  watchtower: {
    id: "watchtower",
    name: "Watchtower",
    containerName: "arknas-watchtower",
    image: "containrrr/watchtower:latest",
    category: "运维",
    description: "自动更新容器镜像",
    openPortKey: null,
    openPath: ""
  }
};

const BUNDLE_DEFINITIONS = {
  "media-stack": {
    id: "media-stack",
    name: "影视套件",
    apps: ["jellyfin", "qbittorrent", "watchtower"]
  }
};

const runningTasks = new Set();

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function normalizeHostPath(p) {
  return path.resolve(String(p || "").trim());
}

function getAppDef(appId) {
  const appDef = APP_DEFINITIONS[appId];
  if (!appDef) throw new HttpError(400, "不支持的应用");
  return appDef;
}

function getBundleDef(bundleId) {
  const bundle = BUNDLE_DEFINITIONS[bundleId];
  if (!bundle) throw new HttpError(400, "不支持的应用套件");
  return bundle;
}

async function findContainerSummaryByName(name) {
  const list = await docker.listContainers({ all: true, filters: { name: [name] } });
  return list[0] || null;
}

async function findContainerByName(name) {
  const summary = await findContainerSummaryByName(name);
  if (!summary) return null;
  return docker.getContainer(summary.Id);
}

async function pullImage(image, onProgress) {
  return new Promise((resolve, reject) => {
    docker.pull(image, (err, stream) => {
      if (err) return reject(err);
      docker.modem.followProgress(
        stream,
        (progressErr) => {
          if (progressErr) reject(progressErr);
          else resolve(true);
        },
        (event) => {
          if (onProgress) onProgress(event);
        }
      );
    });
  });
}

function buildStatus(appDef, containerInfo, cfg) {
  if (!containerInfo) {
    return {
      ...appDef,
      installed: false,
      running: false,
      status: "not_installed",
      openUrl: appDef.openPortKey ? `http://127.0.0.1:${cfg[appDef.openPortKey]}${appDef.openPath}` : ""
    };
  }

  const state = containerInfo.State || "unknown";
  const running = state === "running";

  return {
    ...appDef,
    installed: true,
    running,
    status: running ? "running" : "stopped",
    containerId: containerInfo.Id,
    containerStatusText: containerInfo.Status,
    openUrl: appDef.openPortKey ? `http://127.0.0.1:${cfg[appDef.openPortKey]}${appDef.openPath}` : ""
  };
}

function buildCommonContainerOptions(appDef) {
  return {
    name: appDef.containerName,
    Image: appDef.image,
    HostConfig: {
      RestartPolicy: { Name: "unless-stopped" },
      NetworkMode: config.internalNetwork
    },
    NetworkingConfig: {
      EndpointsConfig: {
        [config.internalNetwork]: {}
      }
    },
    Labels: {
      "arknas.managed": "true",
      "arknas.app": appDef.id
    }
  };
}

function buildJellyfinOptions(cfg) {
  const appDef = APP_DEFINITIONS.jellyfin;
  const mediaPath = normalizeHostPath(cfg.mediaPath);
  const dockerDataPath = normalizeHostPath(cfg.dockerDataPath);
  const configDir = path.join(dockerDataPath, "jellyfin", "config");
  const cacheDir = path.join(dockerDataPath, "jellyfin", "cache");

  ensureDir(mediaPath);
  ensureDir(configDir);
  ensureDir(cacheDir);

  const base = buildCommonContainerOptions(appDef);

  return {
    ...base,
    ExposedPorts: {
      "8096/tcp": {}
    },
    HostConfig: {
      ...base.HostConfig,
      Binds: [`${configDir}:/config`, `${cacheDir}:/cache`, `${mediaPath}:/media`],
      PortBindings: {
        "8096/tcp": [{ HostPort: String(cfg.jellyfinHostPort) }]
      }
    }
  };
}

function buildQBOptions(cfg) {
  const appDef = APP_DEFINITIONS.qbittorrent;
  const downloadsPath = normalizeHostPath(cfg.downloadsPath);
  const dockerDataPath = normalizeHostPath(cfg.dockerDataPath);
  const configDir = path.join(dockerDataPath, "qbittorrent", "config");
  const webPort = String(cfg.qbWebPort);
  const peerPort = String(cfg.qbPeerPort);

  ensureDir(downloadsPath);
  ensureDir(configDir);

  const base = buildCommonContainerOptions(appDef);

  return {
    ...base,
    Env: [
      `TZ=${process.env.TZ || "Asia/Shanghai"}`,
      "PUID=0",
      "PGID=0",
      `WEBUI_PORT=${webPort}`,
      `TORRENTING_PORT=${peerPort}`
    ],
    ExposedPorts: {
      [`${webPort}/tcp`]: {},
      [`${peerPort}/tcp`]: {},
      [`${peerPort}/udp`]: {}
    },
    HostConfig: {
      ...base.HostConfig,
      Binds: [`${configDir}:/config`, `${downloadsPath}:/downloads`],
      PortBindings: {
        [`${webPort}/tcp`]: [{ HostPort: webPort }],
        [`${peerPort}/tcp`]: [{ HostPort: peerPort }],
        [`${peerPort}/udp`]: [{ HostPort: peerPort }]
      }
    }
  };
}

function buildPortainerOptions(cfg) {
  const appDef = APP_DEFINITIONS.portainer;
  const dockerDataPath = normalizeHostPath(cfg.dockerDataPath);
  const dataDir = path.join(dockerDataPath, "portainer", "data");

  ensureDir(dataDir);

  const base = buildCommonContainerOptions(appDef);

  return {
    ...base,
    ExposedPorts: {
      "9000/tcp": {}
    },
    HostConfig: {
      ...base.HostConfig,
      Binds: ["/var/run/docker.sock:/var/run/docker.sock", `${dataDir}:/data`],
      PortBindings: {
        "9000/tcp": [{ HostPort: String(cfg.portainerHostPort) }]
      }
    }
  };
}

function buildWatchtowerOptions(cfg) {
  const appDef = APP_DEFINITIONS.watchtower;
  const base = buildCommonContainerOptions(appDef);

  return {
    ...base,
    Env: [
      `TZ=${process.env.TZ || "Asia/Shanghai"}`,
      `WATCHTOWER_POLL_INTERVAL=${cfg.watchtowerInterval}`,
      "WATCHTOWER_CLEANUP=true",
      "WATCHTOWER_LABEL_ENABLE=false",
      "DOCKER_HOST=tcp://docker-proxy:2375"
    ],
    Cmd: ["--cleanup", "--interval", String(cfg.watchtowerInterval)],
    HostConfig: {
      ...base.HostConfig
    }
  };
}

function buildAppCreateOptions(appId, cfg) {
  if (appId === "jellyfin") return buildJellyfinOptions(cfg);
  if (appId === "qbittorrent") return buildQBOptions(cfg);
  if (appId === "portainer") return buildPortainerOptions(cfg);
  if (appId === "watchtower") return buildWatchtowerOptions(cfg);
  throw new HttpError(400, "不支持的应用");
}

function getAppDataDir(appId, cfg) {
  const dockerDataPath = normalizeHostPath(cfg.dockerDataPath);
  if (appId === "jellyfin") return path.join(dockerDataPath, "jellyfin");
  if (appId === "qbittorrent") return path.join(dockerDataPath, "qbittorrent");
  if (appId === "portainer") return path.join(dockerDataPath, "portainer");
  return "";
}

async function runInstall(appId, taskId, options = {}) {
  const appDef = getAppDef(appId);
  const existing = await findContainerByName(appDef.containerName);
  if (existing) {
    if (options.skipIfInstalled) {
      appendTaskLog(taskId, `${appDef.name} 已安装，跳过`);
      return { ok: true, appId, skipped: true, message: `${appDef.name} 已安装` };
    }
    throw new HttpError(409, `${appDef.name} 已安装`);
  }

  const cfg = getRawIntegrationConfig();
  appendTaskLog(taskId, `开始拉取镜像 ${appDef.image}`);
  await pullImage(appDef.image, (event) => {
    if (!event) return;
    if (event.status && (event.status.includes("Pulling") || event.status.includes("Downloading") || event.status.includes("Extracting"))) {
      appendTaskLog(taskId, `${event.status}${event.progress ? ` ${event.progress}` : ""}`);
    }
  });

  updateAppTask(taskId, { progress: 45, message: "创建容器" });
  const createOptions = buildAppCreateOptions(appId, cfg);
  const container = await docker.createContainer(createOptions);
  appendTaskLog(taskId, `容器已创建 ${container.id.slice(0, 12)}`);

  updateAppTask(taskId, { progress: 72, message: "启动容器" });
  await container.start();
  appendTaskLog(taskId, `${appDef.name} 已启动`);

  const updates = {};
  if (appId === "jellyfin" && !cfg.jellyfinBaseUrl) {
    updates.jellyfinBaseUrl = `http://127.0.0.1:${cfg.jellyfinHostPort}`;
  }
  if (appId === "qbittorrent" && !cfg.qbBaseUrl) {
    updates.qbBaseUrl = `http://127.0.0.1:${cfg.qbWebPort}`;
  }
  if (Object.keys(updates).length > 0) {
    saveIntegrations(updates);
  }

  return {
    ok: true,
    appId,
    containerId: container.id,
    message: `${appDef.name} 已安装并启动`
  };
}

async function runControl(appId, action, taskId) {
  const appDef = getAppDef(appId);
  const container = await findContainerByName(appDef.containerName);
  if (!container) throw new HttpError(404, `${appDef.name} 未安装`);

  appendTaskLog(taskId, `${appDef.name} 执行 ${action}`);
  if (action === "start") await container.start();
  else if (action === "stop") await container.stop();
  else if (action === "restart") await container.restart();
  else throw new HttpError(400, "不支持的操作");

  appendTaskLog(taskId, `${appDef.name} ${action} 完成`);
  return { ok: true, appId, action };
}

async function runUninstall(appId, options = {}, taskId) {
  const appDef = getAppDef(appId);
  const container = await findContainerByName(appDef.containerName);
  if (!container) throw new HttpError(404, `${appDef.name} 未安装`);

  const inspect = await container.inspect();
  if (inspect.State?.Running) {
    appendTaskLog(taskId, "停止容器");
    await container.stop({ t: 10 });
  }
  appendTaskLog(taskId, "删除容器");
  await container.remove({ force: true });

  if (options.removeData) {
    const cfg = getRawIntegrationConfig();
    const dir = getAppDataDir(appId, cfg);
    if (dir) {
      appendTaskLog(taskId, `删除数据目录 ${dir}`);
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }

  return { ok: true, appId, removedData: Boolean(options.removeData) };
}

async function runActionWithProgress(taskId, appId, action, options = {}) {
  if (action === "install") {
    markTaskRunning(taskId, 8, "检查安装状态");
    const result = await runInstall(appId, taskId, options);
    updateAppTask(taskId, { progress: 95, message: "完成容器启动" });
    return result;
  }

  if (action === "uninstall") {
    markTaskRunning(taskId, 10, "正在卸载应用");
    const result = await runUninstall(appId, options, taskId);
    updateAppTask(taskId, { progress: 95, message: "清理完成" });
    return result;
  }

  markTaskRunning(taskId, 20, `执行 ${action}`);
  const result = await runControl(appId, action, taskId);
  updateAppTask(taskId, { progress: 95, message: "操作完成" });
  return result;
}

async function runBundleInstall(taskId, bundleId) {
  const bundle = getBundleDef(bundleId);
  markTaskRunning(taskId, 5, `开始安装套件：${bundle.name}`);
  appendTaskLog(taskId, `套件包含：${bundle.apps.join(", ")}`);

  for (let i = 0; i < bundle.apps.length; i += 1) {
    const appId = bundle.apps[i];
    const percentBase = 10 + Math.floor((i / bundle.apps.length) * 75);
    updateAppTask(taskId, { progress: percentBase, message: `安装 ${appId}` });
    appendTaskLog(taskId, `安装子应用 ${appId}`);
    await runInstall(appId, taskId, { skipIfInstalled: true });
  }

  updateAppTask(taskId, { progress: 96, message: "套件安装完成" });
  appendTaskLog(taskId, "套件安装全部完成");
  return { ok: true, bundleId, message: `${bundle.name} 安装完成` };
}

function scheduleTask(taskId, appId, action, actor, options = {}) {
  if (runningTasks.has(taskId)) return;
  runningTasks.add(taskId);

  setTimeout(async () => {
    try {
      const result = await runActionWithProgress(taskId, appId, action, options);
      markTaskSuccess(taskId, result.message || `${action} 成功`);
      appendTaskLog(taskId, "任务完成");
      writeAudit({
        action: `app_${action}`,
        actor,
        target: appId,
        status: "ok",
        detail: JSON.stringify(result)
      });
    } catch (err) {
      const message = err?.message || String(err);
      markTaskFailed(taskId, message);
      appendTaskLog(taskId, `失败：${message}`);
      writeAudit({
        action: `app_${action}`,
        actor,
        target: appId,
        status: "failed",
        detail: message
      });
    } finally {
      runningTasks.delete(taskId);
    }
  }, 20);
}

function scheduleBundleTask(taskId, bundleId, actor) {
  if (runningTasks.has(taskId)) return;
  runningTasks.add(taskId);

  setTimeout(async () => {
    try {
      const result = await runBundleInstall(taskId, bundleId);
      markTaskSuccess(taskId, result.message || "套件安装成功");
      appendTaskLog(taskId, "套件任务完成");
      writeAudit({
        action: "app_bundle_install",
        actor,
        target: bundleId,
        status: "ok",
        detail: JSON.stringify(result)
      });
    } catch (err) {
      const message = err?.message || String(err);
      markTaskFailed(taskId, message);
      appendTaskLog(taskId, `失败：${message}`);
      writeAudit({
        action: "app_bundle_install",
        actor,
        target: bundleId,
        status: "failed",
        detail: message
      });
    } finally {
      runningTasks.delete(taskId);
    }
  }, 20);
}

export async function listManagedApps() {
  const cfg = getRawIntegrationConfig();
  const keys = Object.keys(APP_DEFINITIONS);
  const statuses = await Promise.all(
    keys.map(async (key) => {
      const app = APP_DEFINITIONS[key];
      const container = await findContainerSummaryByName(app.containerName);
      return buildStatus(app, container, cfg);
    })
  );

  return statuses;
}

export function listManagedBundles() {
  return Object.values(BUNDLE_DEFINITIONS);
}

export function listManagedAppTasks(limit = 60) {
  return listAppTasks(limit);
}

export function getManagedAppTask(taskId) {
  return getAppTaskById(taskId);
}

export function getManagedAppTaskLogs(taskId) {
  return getTaskLogs(taskId);
}

export function createAppActionTask({ appId, action, actor = "system", options = {} }) {
  getAppDef(appId);
  const supported = ["install", "start", "stop", "restart", "uninstall"];
  if (!supported.includes(action)) {
    throw new HttpError(400, "不支持的任务动作");
  }

  const task = createAppTask({
    appId,
    action,
    actor,
    message: `已加入队列：${action}`,
    options
  });

  appendTaskLog(task.id, `任务创建：${appId} ${action}`);
  scheduleTask(task.id, appId, action, actor, options);
  return task;
}

export function createBundleInstallTask({ bundleId = "media-stack", actor = "system" }) {
  const bundle = getBundleDef(bundleId);
  const task = createAppTask({
    appId: bundle.id,
    action: "install_bundle",
    actor,
    message: `已加入队列：安装 ${bundle.name}`,
    options: { bundleId, apps: bundle.apps }
  });

  appendTaskLog(task.id, `任务创建：bundle ${bundleId}`);
  scheduleBundleTask(task.id, bundleId, actor);
  return task;
}

export function retryManagedAppTask(taskId, actor = "system") {
  const retryTask = cloneFailedTaskAsRetry(taskId, actor);
  if (!retryTask) {
    throw new HttpError(400, "仅失败任务允许重试");
  }

  appendTaskLog(retryTask.id, `重试来源任务 #${taskId}`);

  if (retryTask.app_id in BUNDLE_DEFINITIONS || retryTask.action === "install_bundle") {
    const bundleId = retryTask.options?.bundleId || retryTask.app_id;
    scheduleBundleTask(retryTask.id, bundleId, actor);
  } else {
    scheduleTask(retryTask.id, retryTask.app_id, retryTask.action, actor, retryTask.options || {});
  }

  return retryTask;
}
