#!/bin/bash
set -euo pipefail

# Only run in remote (Claude Code on the web) environments
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR"

# Install all dependencies and build (JS via Yarn, Python via uv, TS build via turbo)
make deps

# Start support services needed for tests (Postgres, Redis, S3rver)
make start-support
