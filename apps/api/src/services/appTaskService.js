import { db } from "../db.js";

export function createAppTask({ appId, action, actor, message = "任务已创建" }) {
  const now = new Date().toISOString();
  const info = db
    .prepare(
      `INSERT INTO app_tasks
       (app_id, action, status, progress, message, error_detail, actor, created_at, updated_at, finished_at)
       VALUES (?, ?, 'queued', 0, ?, '', ?, ?, ?, NULL)`
    )
    .run(appId, action, message, actor, now, now);

  return getAppTaskById(info.lastInsertRowid);
}

export function updateAppTask(taskId, patch = {}) {
  const current = getAppTaskById(taskId);
  const next = {
    status: patch.status ?? current.status,
    progress: typeof patch.progress === "number" ? Math.max(0, Math.min(100, patch.progress)) : current.progress,
    message: patch.message ?? current.message,
    error_detail: patch.errorDetail ?? current.error_detail,
    updated_at: new Date().toISOString(),
    finished_at: patch.finishedAt ?? current.finished_at
  };

  db.prepare(
    `UPDATE app_tasks
     SET status = ?, progress = ?, message = ?, error_detail = ?, updated_at = ?, finished_at = ?
     WHERE id = ?`
  ).run(next.status, next.progress, next.message, next.error_detail, next.updated_at, next.finished_at, taskId);

  return getAppTaskById(taskId);
}

export function markTaskRunning(taskId, progress = 5, message = "执行中") {
  return updateAppTask(taskId, {
    status: "running",
    progress,
    message
  });
}

export function markTaskSuccess(taskId, message = "执行成功") {
  const finishedAt = new Date().toISOString();
  return updateAppTask(taskId, {
    status: "success",
    progress: 100,
    message,
    errorDetail: "",
    finishedAt
  });
}

export function markTaskFailed(taskId, errorMessage) {
  const finishedAt = new Date().toISOString();
  return updateAppTask(taskId, {
    status: "failed",
    message: "执行失败",
    errorDetail: String(errorMessage || "unknown error"),
    finishedAt
  });
}

export function listAppTasks(limit = 60) {
  return db
    .prepare(
      `SELECT id, app_id, action, status, progress, message, error_detail, actor, created_at, updated_at, finished_at
       FROM app_tasks
       ORDER BY id DESC
       LIMIT ?`
    )
    .all(limit);
}

export function getAppTaskById(id) {
  const row = db
    .prepare(
      `SELECT id, app_id, action, status, progress, message, error_detail, actor, created_at, updated_at, finished_at
       FROM app_tasks
       WHERE id = ?`
    )
    .get(id);
  return row || null;
}
