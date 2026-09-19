import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { Express } from "express";
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

  app.use("/oauth/linkedin", createLinkedInOAuthRouter({ config: ctx.config, db: ctx.db, adapter: ctx.adapter }));

  app.post("/mcp", async (req, res) => {
    const mcpServer = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION });
    registerLinkedInTools(mcpServer, ctx);
    try {
      // Stateless + plain JSON responses (no SSE) - simpler to operate for a
      // single-operator local tool than session/stream management.
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableJsonResponse: true,
      });
      await mcpServer.connect(transport);
      await transport.handleRequest(req, res, req.body);
      res.on("close", () => {
        transport.close();
        mcpServer.close();
      });
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

  // Stateless mode doesn't support the server-initiated GET/DELETE session semantics.
  app.get("/mcp", (_req, res) => res.status(405).json(methodNotAllowed()));
  app.delete("/mcp", (_req, res) => res.status(405).json(methodNotAllowed()));

  return app;
}
