import fs from "node:fs";
import path from "node:path";
import { docker } from "./dockerService.js";
import { getRawIntegrationConfig, saveIntegrations } from "./settingsService.js";
import { HttpError } from "../lib/httpError.js";

const APP_DEFINITIONS = {
  jellyfin: {
    id: "jellyfin",
    name: "Jellyfin",
    containerName: "arknas-jellyfin",
    image: "jellyfin/jellyfin:latest"
  },
  qbittorrent: {
    id: "qbittorrent",
    name: "qBittorrent",
    containerName: "arknas-qbittorrent",
    image: "lscr.io/linuxserver/qbittorrent:latest"
  }
};

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function normalizeHostPath(p) {
  return path.resolve(String(p || "").trim());
}

async function findContainerByName(name) {
  const list = await docker.listContainers({ all: true, filters: { name: [name] } });
  if (!list.length) return null;
  return docker.getContainer(list[0].Id);
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

function buildStatus(appDef, containerInfo) {
  if (!containerInfo) {
    return {
      ...appDef,
      installed: false,
      running: false,
      status: "not_installed"
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
    containerStatusText: containerInfo.Status
  };
}

export async function listManagedApps() {
  const keys = Object.keys(APP_DEFINITIONS);
  const statuses = await Promise.all(
    keys.map(async (key) => {
      const app = APP_DEFINITIONS[key];
      const containers = await docker.listContainers({
        all: true,
        filters: { name: [app.containerName] }
      });
      return buildStatus(app, containers[0] || null);
    })
  );

  return statuses;
}

function buildJellyfinOptions(cfg) {
  const mediaPath = normalizeHostPath(cfg.mediaPath);
  const dockerDataPath = normalizeHostPath(cfg.dockerDataPath);
  const configDir = path.join(dockerDataPath, "jellyfin", "config");
  const cacheDir = path.join(dockerDataPath, "jellyfin", "cache");

  ensureDir(mediaPath);
  ensureDir(configDir);
  ensureDir(cacheDir);

  return {
    name: APP_DEFINITIONS.jellyfin.containerName,
    Image: APP_DEFINITIONS.jellyfin.image,
    ExposedPorts: {
      "8096/tcp": {}
    },
    HostConfig: {
      Binds: [`${configDir}:/config`, `${cacheDir}:/cache`, `${mediaPath}:/media`],
      PortBindings: {
        "8096/tcp": [{ HostPort: String(cfg.jellyfinHostPort) }]
      },
      RestartPolicy: { Name: "unless-stopped" }
    },
    Labels: {
      "arknas.managed": "true",
      "arknas.app": "jellyfin"
    }
  };
}

function buildQBOptions(cfg) {
  const downloadsPath = normalizeHostPath(cfg.downloadsPath);
  const dockerDataPath = normalizeHostPath(cfg.dockerDataPath);
  const configDir = path.join(dockerDataPath, "qbittorrent", "config");

  ensureDir(downloadsPath);
  ensureDir(configDir);

  return {
    name: APP_DEFINITIONS.qbittorrent.containerName,
    Image: APP_DEFINITIONS.qbittorrent.image,
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
      Binds: [`${configDir}:/config`, `${downloadsPath}:/downloads`],
      PortBindings: {
        "8080/tcp": [{ HostPort: String(cfg.qbWebPort) }],
        "6881/tcp": [{ HostPort: String(cfg.qbPeerPort) }],
        "6881/udp": [{ HostPort: String(cfg.qbPeerPort) }]
      },
      RestartPolicy: { Name: "unless-stopped" }
    },
    Labels: {
      "arknas.managed": "true",
      "arknas.app": "qbittorrent"
    }
  };
}

export async function installApp(appId) {
  const appDef = APP_DEFINITIONS[appId];
  if (!appDef) throw new HttpError(400, "不支持的应用");

  const existing = await findContainerByName(appDef.containerName);
  if (existing) {
    throw new HttpError(409, `${appDef.name} 已安装`);
  }

  const cfg = getRawIntegrationConfig();
  await pullImage(appDef.image);

  let createOptions;
  if (appId === "jellyfin") {
    createOptions = buildJellyfinOptions(cfg);
  } else {
    createOptions = buildQBOptions(cfg);
  }

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

export async function controlManagedApp(appId, action) {
  const appDef = APP_DEFINITIONS[appId];
  if (!appDef) throw new HttpError(400, "不支持的应用");

  const container = await findContainerByName(appDef.containerName);
  if (!container) throw new HttpError(404, `${appDef.name} 未安装`);

  if (action === "start") await container.start();
  else if (action === "stop") await container.stop();
  else if (action === "restart") await container.restart();
  else throw new HttpError(400, "不支持的操作");

  return { ok: true, appId, action };
}

export async function uninstallApp(appId, { removeData = false } = {}) {
  const appDef = APP_DEFINITIONS[appId];
  if (!appDef) throw new HttpError(400, "不支持的应用");

  const container = await findContainerByName(appDef.containerName);
  if (!container) throw new HttpError(404, `${appDef.name} 未安装`);

  const inspect = await container.inspect();
  if (inspect.State?.Running) {
    await container.stop({ t: 10 });
  }
  await container.remove({ force: true });

  if (removeData) {
    const cfg = getRawIntegrationConfig();
    const dockerDataPath = normalizeHostPath(cfg.dockerDataPath);
    const dir = appId === "jellyfin" ? path.join(dockerDataPath, "jellyfin") : path.join(dockerDataPath, "qbittorrent");
    fs.rmSync(dir, { recursive: true, force: true });
  }

  return { ok: true, appId, removedData: Boolean(removeData) };
}
