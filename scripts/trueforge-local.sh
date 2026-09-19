#!/usr/bin/env bash
set -euo pipefail
# Version checked against npm and trueforge.dev on 2026-09-19.
node -e 'const [a,b]=process.versions.node.split(".").map(Number); if(a<22 || (a===22 && b<14)) { console.error("TrueForge needs Node 22.14+"); process.exit(1); }'
exec npx --yes @truefoundry/trueforge@0.2.0 "$@"
