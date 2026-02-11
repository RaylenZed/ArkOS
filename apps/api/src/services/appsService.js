import fs from "node:fs";
import path from "node:path";
import { docker } from "./dockerService.js";
import { getRawIntegrationConfig, saveIntegrations } from "./settingsService.js";
import { HttpError } from "../lib/httpError.js";
import {
  createAppTask,
  getAppTaskById,
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

async function findContainerSummaryByName(name) {
  const list = await docker.listContainers({ all: true, filters: { name: [name] } });
  return list[0] || null;
}

async function findContainerByName(name) {
  const summary = await findContainerSummaryByName(name);
  if (!summary) return null;
  return docker.getContainer(summary.Id);
}

async function pullImage(image) {
  return new Promise((resolve, reject) => {
    docker.pull(image, (err, stream) => {
      if (err) return reject(err);
      docker.modem.followProgress(
        stream,
        (progressErr) => {
          if (progressErr) reject(progressErr);
          else resolve(true);
        },
        () => {}
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

  ensureDir(downloadsPath);
  ensureDir(configDir);

  const base = buildCommonContainerOptions(appDef);

  return {
    ...base,
    Env: [
      `TZ=${process.env.TZ || "Asia/Shanghai"}`,
      "PUID=0",
      "PGID=0",
      `WEBUI_PORT=${cfg.qbWebPort}`,
      `TORRENTING_PORT=${cfg.qbPeerPort}`
    ],
    ExposedPorts: {
      "8080/tcp": {},
      "6881/tcp": {},
      "6881/udp": {}
    },
    HostConfig: {
      ...base.HostConfig,
      Binds: [`${configDir}:/config`, `${downloadsPath}:/downloads`],
      PortBindings: {
        "8080/tcp": [{ HostPort: String(cfg.qbWebPort) }],
        "6881/tcp": [{ HostPort: String(cfg.qbPeerPort) }],
        "6881/udp": [{ HostPort: String(cfg.qbPeerPort) }]
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
    Cmd: ["--cleanup", `--interval`, String(cfg.watchtowerInterval)],
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

async function runInstall(appId) {
  const appDef = getAppDef(appId);
  const existing = await findContainerByName(appDef.containerName);
  if (existing) {
    throw new HttpError(409, `${appDef.name} 已安装`);
  }

  const cfg = getRawIntegrationConfig();
  await pullImage(appDef.image);
  const createOptions = buildAppCreateOptions(appId, cfg);
  const container = await docker.createContainer(createOptions);
  await container.start();

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

async function runControl(appId, action) {
  const appDef = getAppDef(appId);
  const container = await findContainerByName(appDef.containerName);
  if (!container) throw new HttpError(404, `${appDef.name} 未安装`);

  if (action === "start") await container.start();
  else if (action === "stop") await container.stop();
  else if (action === "restart") await container.restart();
  else throw new HttpError(400, "不支持的操作");

  return { ok: true, appId, action };
}

async function runUninstall(appId, options = {}) {
  const appDef = getAppDef(appId);
  const container = await findContainerByName(appDef.containerName);
  if (!container) throw new HttpError(404, `${appDef.name} 未安装`);

  const inspect = await container.inspect();
  if (inspect.State?.Running) {
    await container.stop({ t: 10 });
  }
  await container.remove({ force: true });

  if (options.removeData) {
    const cfg = getRawIntegrationConfig();
    const dir = getAppDataDir(appId, cfg);
    if (dir) fs.rmSync(dir, { recursive: true, force: true });
  }

  return { ok: true, appId, removedData: Boolean(options.removeData) };
}

async function runActionWithProgress(taskId, appId, action, options = {}) {
  if (action === "install") {
    markTaskRunning(taskId, 10, "检查安装状态");
    updateAppTask(taskId, { progress: 25, message: "拉取镜像中" });
    const result = await runInstall(appId);
    updateAppTask(taskId, { progress: 92, message: "完成容器启动" });
    return result;
  }

  if (action === "uninstall") {
    markTaskRunning(taskId, 15, "正在卸载应用" );
    const result = await runUninstall(appId, options);
    updateAppTask(taskId, { progress: 92, message: "清理完成" });
    return result;
  }

  markTaskRunning(taskId, 20, `执行 ${action}`);
  const result = await runControl(appId, action);
  updateAppTask(taskId, { progress: 92, message: "操作完成" });
  return result;
}

function scheduleTask(taskId, appId, action, actor, options = {}) {
  if (runningTasks.has(taskId)) return;
  runningTasks.add(taskId);

  setTimeout(async () => {
    try {
      const result = await runActionWithProgress(taskId, appId, action, options);
      markTaskSuccess(taskId, result.message || `${action} 成功`);
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

export function listManagedAppTasks(limit = 60) {
  return listAppTasks(limit);
}

export function getManagedAppTask(taskId) {
  return getAppTaskById(taskId);
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
    message: `已加入队列：${action}`
  });

  scheduleTask(task.id, appId, action, actor, options);
  return task;
}
