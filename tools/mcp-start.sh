#!/bin/bash
# Starts the DigiLight MCP server for Claude Code (.mcp.json at the repository root): installs
# the tools' packages first if they are missing and uses a cloud session's Chromium if there is one.
cd "$(dirname "$0")" || exit 1
./install-deps.sh --if-missing || exit 1
if [ -z "${DIGILIGHT_BROWSER:-}" ] && [ -x /opt/pw-browsers/chromium ]; then
  export DIGILIGHT_BROWSER=/opt/pw-browsers/chromium
fi
exec node digilight-mcp.cjs
