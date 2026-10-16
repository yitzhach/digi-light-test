#!/bin/bash
# Cloud sessions (claude.ai/code): install the DigiLight tools (CLI + MCP server) and point
# them at the session's preinstalled Chromium, so Claude can run DigiLight for the user.
set -euo pipefail
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi
"$CLAUDE_PROJECT_DIR/tools/install-deps.sh"
if [ -x /opt/pw-browsers/chromium ] && [ -n "${CLAUDE_ENV_FILE:-}" ]; then
  echo 'export DIGILIGHT_BROWSER=/opt/pw-browsers/chromium' >> "$CLAUDE_ENV_FILE"
fi
