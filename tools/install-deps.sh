#!/bin/bash
# Installs the tools' packages (npm install in tools/). `--if-missing` skips it when they are
# there. Output goes to stderr (the MCP launcher's stdout is the MCP channel). A lock keeps the
# SessionStart hook and the MCP launcher from installing at the same time.
cd "$(dirname "$0")" || exit 1
if command -v flock >/dev/null 2>&1; then
  exec 9>.install.lock
  flock 9
fi
if [ "${1:-}" = "--if-missing" ] && [ -d node_modules/@modelcontextprotocol/sdk ] && [ -d node_modules/playwright ]; then
  exit 0
fi
npm install --no-audit --no-fund --loglevel=error >&2
