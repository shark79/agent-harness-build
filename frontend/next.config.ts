import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Don't let `next dev`/`next build` regenerate AGENTS.md/CLAUDE.md on every run.
  agentRules: false,
};

export default nextConfig;
