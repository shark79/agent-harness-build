import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { Express } from "express";
import { randomUUID } from "node:crypto";
import { createLinkedInOAuthRouter } from "./oauth/linkedin.js";
import type { AppContext } from "./tools/context.js";
import { registerLinkedInTools } from "./tools/index.js";

const SERVER_NAME = "linkedin-social-publisher";
const SERVER_VERSION = "0.1.0";

function methodNotAllowed(): { jsonrpc: "2.0"; error: { code: number; message: string }; id: null } {
  return { jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed." }, id: null };
}

/**
 * Builds the Express app: the MCP Streamable HTTP endpoint at POST /mcp
 * (stateless - a fresh McpServer/transport pair per request, matching the MCP
 * best-practice of stateless JSON for a simpler, easier-to-scale server), plus
 * the LinkedIn OAuth routes mounted alongside it on the same app/port.
 */
export function createApp(ctx: AppContext): Express {
  const app = createMcpExpressApp({ host: ctx.config.host });
  const transports = new Map<string, StreamableHTTPServerTransport>();
  const servers = new Map<string, McpServer>();

  app.use("/oauth/linkedin", createLinkedInOAuthRouter({ config: ctx.config, db: ctx.db, adapter: ctx.adapter }));

  app.post("/mcp", async (req, res) => {
    const sessionId = req.header("mcp-session-id");
    let transport = sessionId ? transports.get(sessionId) : undefined;
    let mcpServer = sessionId ? servers.get(sessionId) : undefined;
    let stateless = false;
    try {
      if (!transport || !mcpServer) {
        mcpServer = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION });
        registerLinkedInTools(mcpServer, ctx);
        const stateful = req.body?.method === "initialize";
        stateless = !stateful;
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: stateful ? () => randomUUID() : undefined,
          onsessioninitialized: (id) => {
            transports.set(id, transport!);
            servers.set(id, mcpServer!);
          },
          onsessionclosed: (id) => {
            transports.delete(id);
            servers.delete(id);
          },
          enableJsonResponse: true,
        });
        await mcpServer.connect(transport);
      }
      await transport.handleRequest(req, res, req.body);
      if (stateless) {
        res.on("finish", () => {
          void transport!.close().catch(() => undefined);
          void mcpServer!.close().catch(() => undefined);
        });
      }
    } catch (error) {
      console.error("Error handling MCP request:", error);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: "2.0",
          error: { code: -32603, message: "Internal server error" },
          id: null,
        });
      }
    }
  });

  app.get("/mcp", async (req, res) => {
    const sessionId = req.header("mcp-session-id");
    const transport = sessionId ? transports.get(sessionId) : undefined;
    if (!transport) {
      res.status(405).json(methodNotAllowed());
      return;
    }
    await transport.handleRequest(req, res);
  });

  app.delete("/mcp", async (req, res) => {
    const sessionId = req.header("mcp-session-id");
    const transport = sessionId ? transports.get(sessionId) : undefined;
    if (!transport) {
      res.status(405).json(methodNotAllowed());
      return;
    }
    await transport.handleRequest(req, res);
  });

  return app;
}
