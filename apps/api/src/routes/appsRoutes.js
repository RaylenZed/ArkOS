import express from "express";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { requireAuth } from "../middleware/authMiddleware.js";
import {
  controlManagedApp,
  installApp,
  listManagedApps,
  uninstallApp
} from "../services/appsService.js";
import { writeAudit } from "../services/auditService.js";

const router = express.Router();
router.use(requireAuth);

router.get(
  "/",
  asyncHandler(async (_req, res) => {
    res.json(await listManagedApps());
  })
);

router.post(
  "/:appId/install",
  asyncHandler(async (req, res) => {
    const result = await installApp(req.params.appId);
    writeAudit({
      action: "app_install",
      actor: req.user.username,
      target: req.params.appId,
      status: "ok"
    });
    res.json(result);
  })
);

router.post(
  "/:appId/:action(start|stop|restart)",
  asyncHandler(async (req, res) => {
    const result = await controlManagedApp(req.params.appId, req.params.action);
    writeAudit({
      action: `app_${req.params.action}`,
      actor: req.user.username,
      target: req.params.appId,
      status: "ok"
    });
    res.json(result);
  })
);

router.delete(
  "/:appId",
  asyncHandler(async (req, res) => {
    const removeData = Boolean(req.query.removeData === "1");
    const result = await uninstallApp(req.params.appId, { removeData });
    writeAudit({
      action: "app_uninstall",
      actor: req.user.username,
      target: req.params.appId,
      status: "ok",
      detail: `removeData=${removeData}`
    });
    res.json(result);
  })
);

export default router;
