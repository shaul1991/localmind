#!/usr/bin/env node
import { loadConfig } from "./config.js";
import { createServer } from "./server.js";
import { log, setLogLevel } from "./util/log.js";

function main(): void {
  const config = loadConfig();
  setLogLevel(config.logLevel);

  const app = createServer(config);
  const server = app.listen(config.port, config.host, () => {
    log.info(`localmind listening on http://${config.host}:${config.port}`);
    log.info(`  default backend: ${config.defaultBackend}`);
    log.info(`  auth: ${config.apiKey ? "enabled (Bearer)" : "disabled (open)"}`);
    log.info(`  endpoints: POST /v1/chat/completions, GET /v1/models, GET /health`);
  });

  const shutdown = (sig: string) => {
    log.info(`received ${sig}, shutting down...`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 3000).unref?.();
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

main();
