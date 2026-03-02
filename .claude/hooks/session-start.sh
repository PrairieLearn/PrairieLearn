#!/bin/bash
set -euo pipefail

# Only run in remote (Claude Code on the web) environments
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
    exit 0
fi

cd "$CLAUDE_PROJECT_DIR"

uv self update
# The default Claude Code environment is still on PostgreSQL 16, which shouldn't cause issues for now.
echo 'export PATH="/usr/lib/postgresql/16/bin:$PATH"' >> "$CLAUDE_ENV_FILE"

make deps
make start-support
