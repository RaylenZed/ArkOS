import { db } from "../db.js";
import { config } from "../config.js";

const INTEGRATION_KEYS = [
  "jellyfinBaseUrl",
  "jellyfinApiKey",
  "jellyfinUserId",
  "qbBaseUrl",
  "qbUsername",
  "qbPassword",
  "mediaPath",
  "downloadsPath",
  "dockerDataPath",
  "jellyfinHostPort",
  "qbWebPort",
  "qbPeerPort"
];

function getSetting(key, fallback = "") {
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key);
  return row ? row.value : fallback;
}

function getNumberSetting(key, fallback) {
  const raw = getSetting(key, fallback);
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : Number(fallback);
}

export function getIntegrations() {
  return {
    jellyfinBaseUrl: getSetting("jellyfinBaseUrl", config.jellyfinBaseUrl),
    jellyfinApiKey: getSetting("jellyfinApiKey", config.jellyfinApiKey),
    jellyfinUserId: getSetting("jellyfinUserId", config.jellyfinUserId),
    qbBaseUrl: getSetting("qbBaseUrl", config.qbBaseUrl),
    qbUsername: getSetting("qbUsername", config.qbUsername),
    qbPassword: getSetting("qbPassword", config.qbPassword ? "******" : ""),
    mediaPath: getSetting("mediaPath", config.mediaPath),
    downloadsPath: getSetting("downloadsPath", config.downloadsPath),
    dockerDataPath: getSetting("dockerDataPath", config.dockerDataPath),
    jellyfinHostPort: getNumberSetting("jellyfinHostPort", config.jellyfinHostPort),
    qbWebPort: getNumberSetting("qbWebPort", config.qbWebPort),
    qbPeerPort: getNumberSetting("qbPeerPort", config.qbPeerPort)
  };
}

export function getRawIntegrationConfig() {
  return {
    jellyfinBaseUrl: getSetting("jellyfinBaseUrl", config.jellyfinBaseUrl),
    jellyfinApiKey: getSetting("jellyfinApiKey", config.jellyfinApiKey),
    jellyfinUserId: getSetting("jellyfinUserId", config.jellyfinUserId),
    qbBaseUrl: getSetting("qbBaseUrl", config.qbBaseUrl),
    qbUsername: getSetting("qbUsername", config.qbUsername),
    qbPassword: getSetting("qbPassword", config.qbPassword),
    mediaPath: getSetting("mediaPath", config.mediaPath),
    downloadsPath: getSetting("downloadsPath", config.downloadsPath),
    dockerDataPath: getSetting("dockerDataPath", config.dockerDataPath),
    jellyfinHostPort: getNumberSetting("jellyfinHostPort", config.jellyfinHostPort),
    qbWebPort: getNumberSetting("qbWebPort", config.qbWebPort),
    qbPeerPort: getNumberSetting("qbPeerPort", config.qbPeerPort)
  };
}

export function saveIntegrations(input) {
  const now = new Date().toISOString();
  const upsert = db.prepare(
    "INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at"
  );

  for (const key of INTEGRATION_KEYS) {
    if (typeof input[key] === "undefined") continue;
    let value = String(input[key] ?? "");
    if (key === "qbPassword" && value.trim() === "******") continue;
    upsert.run(key, value, now);
  }
}
