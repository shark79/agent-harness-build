import { randomUUID } from "node:crypto";
import { mkdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const assetDirectory = path.resolve(process.env.CAMPAIGNFORGE_ASSET_DIR || path.join(process.cwd(), ".campaignforge-assets"));
const assetIdPattern = /^[0-9a-f-]{36}$/i;

function publicBaseUrl(): string {
  return (process.env.CAMPAIGNFORGE_ASSET_BASE_URL || `http://${process.env.HOST || "127.0.0.1"}:${process.env.PORT || "8788"}`).replace(/\/$/, "");
}

export function publicAssetUrl(id: string): string {
  return `${publicBaseUrl()}/assets/${id}.png`;
}

export async function saveGeneratedPng(base64: string): Promise<{ id: string; url: string }> {
  const id = randomUUID();
  await mkdir(assetDirectory, { recursive: true });
  await writeFile(path.join(assetDirectory, `${id}.png`), Buffer.from(base64, "base64"), { mode: 0o600 });
  return { id, url: publicAssetUrl(id) };
}

export async function generatedPngPath(id: string): Promise<string | undefined> {
  if (!assetIdPattern.test(id)) return undefined;
  const filePath = path.join(assetDirectory, `${id}.png`);
  try {
    const file = await stat(filePath);
    return file.isFile() ? filePath : undefined;
  } catch {
    return undefined;
  }
}
