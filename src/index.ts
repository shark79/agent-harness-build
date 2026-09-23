import "dotenv/config";
import express, { type NextFunction, type Request, type Response } from "express";
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createCampaignForgeServer } from "./server.js";
import { generatedPngPath } from "./assets.js";

const port = Number(process.env.PORT || 8788);
const host = process.env.HOST || "127.0.0.1";
const apiKey = process.env.CAMPAIGNFORGE_API_KEY;
const app = createMcpExpressApp({ host });
app.use(express.json({ limit: "1mb" }));

app.get("/assets/:id.png", async (req, res) => {
  const filePath = await generatedPngPath(req.params.id);
  if (!filePath) { res.status(404).json({ error: "Generated image not found" }); return; }
  res.set({ "Cache-Control": "private, max-age=3600", "Content-Type": "image/png", "X-Content-Type-Options": "nosniff" });
  res.sendFile(filePath, { dotfiles: "allow" });
});

function requireApiKey(req: Request, res: Response, next: NextFunction): void {
  if (!apiKey) return next();
  const bearer = req.header("authorization")?.replace(/^Bearer\s+/i, "");
  const supplied = req.header("x-api-key") || bearer;
  if (supplied !== apiKey) { res.status(401).json({ error: "Valid x-api-key or Bearer token required" }); return; }
  next();
}

app.get("/health", (_req, res) => res.json({ status: "ok", service: "campaignforge-mcp", publishingEnabled: process.env.PUBLISHING_ENABLED === "true" }));
app.all("/mcp", requireApiKey, async (req, res) => {
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  const server = createCampaignForgeServer();
  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
    res.on("close", () => void server.close());
  } catch (error) {
    if (!res.headersSent) res.status(500).json({ error: error instanceof Error ? error.message : "MCP request failed" });
  }
});

app.listen(port, host, () => console.log(`CampaignForge MCP listening at http://${host}:${port}/mcp`));
