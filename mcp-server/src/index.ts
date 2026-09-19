import "dotenv/config";
import { resolve } from "node:path";
import { loadConfig } from "./config.js";
import { createLinkedInAdapter } from "./platforms/linkedin/adapter.js";
import { createApp } from "./server.js";
import { openDatabase } from "./storage/db.js";
import type { AppContext } from "./tools/context.js";

function main(): void {
  let config;
  try {
    config = loadConfig(process.env);
  } catch (error) {
    // Fail with a clear message, not a stack trace.
    console.error(`Configuration error: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }

  const db = openDatabase(config.databasePath);
  const adapter = createLinkedInAdapter(config);
  const mediaRoot = resolve("generated");

  const ctx: AppContext = { config, db, adapter, mediaRoot };
  const app = createApp(ctx);

  const server = app.listen(config.port, config.host, () => {
    console.log(`LinkedIn social publisher MCP server listening on http://${config.host}:${config.port}`);
    console.log(`MCP endpoint:   http://${config.host}:${config.port}/mcp`);
    console.log(`OAuth start:    http://${config.host}:${config.port}/oauth/linkedin/start`);
  });

  const shutdown = () => {
    server.close(() => {
      db.close();
      process.exit(0);
    });
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main();
