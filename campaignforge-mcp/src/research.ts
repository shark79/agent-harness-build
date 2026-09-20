import { errorResult, jsonResult, type ToolResult } from "./types.js";

export async function researchUrl(url: string): Promise<ToolResult> {
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) return errorResult("Firecrawl is not configured", "Set FIRECRAWL_API_KEY or continue with the user-approved brief only.");
  try {
    const response = await fetch("https://api.firecrawl.dev/v1/scrape", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ url, formats: ["markdown"], onlyMainContent: true }),
    });
    const body = await response.json() as { success?: boolean; data?: { markdown?: string; metadata?: unknown }; error?: string };
    if (!response.ok || !body.success) return errorResult(body.error || `Research request failed (${response.status})`);
    const markdown = body.data?.markdown || "";
    return jsonResult({ sourceUrl: url, extractedAt: new Date().toISOString(), markdown: markdown.slice(0, 16000), metadata: body.data?.metadata });
  } catch (error) {
    return errorResult(error instanceof Error ? error.message : "Unable to research URL");
  }
}
