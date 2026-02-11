import express from "express";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { requireAuth } from "../middleware/authMiddleware.js";
import {
  createAppActionTask,
  getManagedAppTask,
  listManagedApps,
  listManagedAppTasks
} from "../services/appsService.js";

const router = express.Router();
router.use(requireAuth);

router.get(
  "/",
  asyncHandler(async (_req, res) => {
    res.json(await listManagedApps());
  })
);

router.get(
  "/tasks",
  asyncHandler(async (req, res) => {
    const limit = Number(req.query.limit || 60);
    res.json(listManagedAppTasks(limit));
  })
);

router.get(
  "/tasks/:taskId",
  asyncHandler(async (req, res) => {
    const task = getManagedAppTask(Number(req.params.taskId));
    if (!task) {
      return res.status(404).json({ error: "任务不存在" });
    }
    res.json(task);
  })
);

router.post(
  "/:appId/install",
  asyncHandler(async (req, res) => {
    const task = createAppActionTask({
      appId: req.params.appId,
      action: "install",
      actor: req.user.username
    });
    res.status(202).json(task);
  })
);

router.post(
  "/:appId/:action(start|stop|restart)",
  asyncHandler(async (req, res) => {
    const task = createAppActionTask({
      appId: req.params.appId,
      action: req.params.action,
      actor: req.user.username
    });
    res.status(202).json(task);
  })
);

router.delete(
  "/:appId",
  asyncHandler(async (req, res) => {
    const removeData = Boolean(req.query.removeData === "1");
    const task = createAppActionTask({
      appId: req.params.appId,
      action: "uninstall",
      actor: req.user.username,
      options: { removeData }
    });
    res.status(202).json(task);
  })
);

export default router;
