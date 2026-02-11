import { db } from "../db.js";

function toJson(value, fallback = {}) {
  try {
    return JSON.stringify(value ?? fallback);
  } catch {
    return JSON.stringify(fallback);
  }
}

function parseJson(value, fallback = {}) {
  try {
    return JSON.parse(value || "");
  } catch {
    return fallback;
  }
}

export function createAppTask({
  appId,
  action,
  actor,
  message = "任务已创建",
  options = {},
  retriedFrom = null
}) {
  const now = new Date().toISOString();
  const info = db
    .prepare(
      `INSERT INTO app_tasks
       (app_id, action, status, progress, message, error_detail, actor, created_at, updated_at, finished_at, log_text, options_json, retried_from)
       VALUES (?, ?, 'queued', 0, ?, '', ?, ?, ?, NULL, '', ?, ?)`
    )
    .run(appId, action, message, actor, now, now, toJson(options, {}), retriedFrom);

  return getAppTaskById(info.lastInsertRowid);
}

export function updateAppTask(taskId, patch = {}) {
  const current = getAppTaskById(taskId);
  if (!current) return null;

  const next = {
    status: patch.status ?? current.status,
    progress: typeof patch.progress === "number" ? Math.max(0, Math.min(100, patch.progress)) : current.progress,
    message: patch.message ?? current.message,
    error_detail: patch.errorDetail ?? current.error_detail,
    updated_at: new Date().toISOString(),
    finished_at: patch.finishedAt ?? current.finished_at,
    options_json: typeof patch.options !== "undefined" ? toJson(patch.options, {}) : toJson(current.options, {}),
    retried_from: typeof patch.retriedFrom !== "undefined" ? patch.retriedFrom : current.retried_from
  };

  db.prepare(
    `UPDATE app_tasks
     SET status = ?, progress = ?, message = ?, error_detail = ?, updated_at = ?, finished_at = ?, options_json = ?, retried_from = ?
     WHERE id = ?`
  ).run(
    next.status,
    next.progress,
    next.message,
    next.error_detail,
    next.updated_at,
    next.finished_at,
    next.options_json,
    next.retried_from,
    taskId
  );

  return getAppTaskById(taskId);
}

export function appendTaskLog(taskId, line) {
  const task = getAppTaskById(taskId);
  if (!task) return null;

  const ts = new Date().toISOString();
  const newLine = `[${ts}] ${String(line || "")}`;
  const oldText = task.log_text || "";
  let merged = oldText ? `${oldText}\n${newLine}` : newLine;

  if (merged.length > 60000) {
    merged = merged.slice(merged.length - 60000);
  }

  db.prepare("UPDATE app_tasks SET log_text = ?, updated_at = ? WHERE id = ?").run(
    merged,
    new Date().toISOString(),
    taskId
  );

  return getAppTaskById(taskId);
}

export function getTaskLogs(taskId) {
  const row = db.prepare("SELECT id, log_text FROM app_tasks WHERE id = ?").get(taskId);
  if (!row) return null;
  return {
    id: row.id,
    logText: row.log_text || "",
    lines: (row.log_text || "").split("\n").filter(Boolean)
  };
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

function mapTaskRow(row) {
  if (!row) return null;
  return {
    ...row,
    options: parseJson(row.options_json || "{}", {}),
    log_text: row.log_text || ""
  };
}

export function listAppTasks(limit = 60) {
  const rows = db
    .prepare(
      `SELECT id, app_id, action, status, progress, message, error_detail, actor, created_at, updated_at, finished_at, log_text, options_json, retried_from
       FROM app_tasks
       ORDER BY id DESC
       LIMIT ?`
    )
    .all(limit);

  return rows.map(mapTaskRow);
}

export function getAppTaskById(id) {
  const row = db
    .prepare(
      `SELECT id, app_id, action, status, progress, message, error_detail, actor, created_at, updated_at, finished_at, log_text, options_json, retried_from
       FROM app_tasks
       WHERE id = ?`
    )
    .get(id);
  return mapTaskRow(row);
}

export function cloneFailedTaskAsRetry(taskId, actor = "system") {
  const task = getAppTaskById(taskId);
  if (!task) return null;
  if (task.status !== "failed") return null;

  return createAppTask({
    appId: task.app_id,
    action: task.action,
    actor,
    message: `重试任务（源 #${task.id}）`,
    options: task.options || {},
    retriedFrom: task.id
  });
}
