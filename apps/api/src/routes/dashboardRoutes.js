import express from "express";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { requireAuth } from "../middleware/authMiddleware.js";
import { getContainerSummary } from "../services/dockerService.js";
import { getMediaSummary } from "../services/jellyfinService.js";
import { getDownloadSummary, listRecentCompleted } from "../services/qbittorrentService.js";
import { getSystemStatus } from "../services/systemService.js";

const router = express.Router();
router.use(requireAuth);

async function withSafePromise(fn) {
  try {
    const data = await fn();
    return { ok: true, data, error: null };
  } catch (err) {
    return { ok: false, data: null, error: err.message || "unknown error" };
  }
}

function buildAlerts({ containers, media, downloads, recentCompleted, system }) {
  const alerts = [];
  const now = new Date().toISOString();

  if (!containers.ok) {
    alerts.push({
      severity: "critical",
      code: "DOCKER_UNAVAILABLE",
      message: containers.error,
      at: now
    });
  } else if ((containers.data?.summary?.error || 0) > 0) {
    alerts.push({
      severity: "warning",
      code: "CONTAINER_ERROR",
      message: `存在 ${containers.data.summary.error} 个异常容器`,
      at: now
    });
  }

  if (!media.ok) {
    alerts.push({
      severity: "warning",
      code: "JELLYFIN_UNAVAILABLE",
      message: media.error,
      at: now
    });
  }

  if (!downloads.ok || !recentCompleted.ok) {
    alerts.push({
      severity: "warning",
      code: "QBIT_UNAVAILABLE",
      message: downloads.error || recentCompleted.error,
      at: now
    });
  }

  if (system.ok) {
    const cpu = system.data?.cpu?.usagePercent || 0;
    const mem = system.data?.memory?.usagePercent || 0;
    const hotDisks = (system.data?.disks || []).filter((d) => Number(d.usePercent || 0) >= 90);

    if (cpu >= 90) {
      alerts.push({
        severity: "warning",
        code: "CPU_HIGH",
        message: `CPU 使用率过高：${cpu}%`,
        at: now
      });
    }

    if (mem >= 90) {
      alerts.push({
        severity: "warning",
        code: "MEMORY_HIGH",
        message: `内存使用率过高：${mem}%`,
        at: now
      });
    }

    for (const disk of hotDisks) {
      alerts.push({
        severity: "warning",
        code: "DISK_HIGH",
        message: `磁盘占用过高：${disk.mount} ${disk.usePercent}%`,
        at: now
      });
    }
  } else {
    alerts.push({
      severity: "warning",
      code: "SYSTEM_UNAVAILABLE",
      message: system.error,
      at: now
    });
  }

  return alerts;
}

router.get(
  "/overview",
  asyncHandler(async (_req, res) => {
    const [containers, media, downloads, recentCompleted, system] = await Promise.all([
      withSafePromise(() => getContainerSummary()),
      withSafePromise(() => getMediaSummary()),
      withSafePromise(() => getDownloadSummary()),
      withSafePromise(() => listRecentCompleted(10)),
      withSafePromise(() => getSystemStatus())
    ]);

    const alerts = buildAlerts({ containers, media, downloads, recentCompleted, system });

    res.json({
      updatedAt: new Date().toISOString(),
      alerts,
      containers,
      media,
      downloads,
      recentCompleted,
      system
    });
  })
);

export default router;
