import { config } from "./config.js";
import { logInfo } from "./lib/logger.js";
import { startAutoRenewScheduler } from "./services/sslService.js";
import { createApp } from "./app.js";

const app = createApp();

app.listen(config.port, () => {
  startAutoRenewScheduler();
  logInfo("arknas_api_started", {
    port: config.port,
    env: config.nodeEnv,
    dbPath: config.dbPath,
    dockerHost: config.dockerHost
  });
});
