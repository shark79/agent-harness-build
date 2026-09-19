import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Don't let `next dev`/`next build` regenerate AGENTS.md/CLAUDE.md on every run.
  agentRules: false,
  // Standalone server output for the Docker runtime stage (copies only the
  // traced node_modules subset instead of the full install).
  output: "standalone",
};

export default nextConfig;
