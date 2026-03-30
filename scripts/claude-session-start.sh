#!/bin/bash

# This script is specialized for the default Claude Code remote environment.

set -euo pipefail

# Only run in remote (Claude Code on the web) environments
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
    exit 0
fi

cd "$CLAUDE_PROJECT_DIR"

# Make PostgreSQL binaries available system-wide (needed by start_postgres.sh
# which runs commands as the postgres user via su).
# TODO: Once start_postgres.sh is updated to use `gosu`, we can remove this.
# The default Claude Code environment is still on PostgreSQL 16, which shouldn't cause issues for now.
for bin in /usr/lib/postgresql/16/bin/*; do
    ln -sf "$bin" /usr/local/bin/
done

# We need graphviz for the python dependencies.
apt-get update -qq && apt-get install -y -qq graphviz libgraphviz-dev postgresql-16-pgvector 2>&1

# Load nvm
. /opt/nvm/nvm.sh

# nvm is already installed in the default Claude Code environment, but we need to install Node.js 24.
nvm install 24
nvm alias default 24

# uv is already installed in the default Claude Code environment, but we need to update it to the latest version.
# https://github.com/astral-sh/uv/issues/14016#issuecomment-2969548188
(cd /tmp && uv pip install --system --reinstall uv)
rm /root/.local/bin/uv # Uninstall the outdated uv binary.

make deps

# Start support services with timeouts to prevent hanging.
# The s3rver script uses lsof which can hang in some environments.
timeout 30 scripts/start_postgres.sh || echo "Warning: start_postgres.sh timed out or failed"
timeout 10 scripts/start_redis.sh || echo "Warning: start_redis.sh timed out or failed"
timeout 15 scripts/start_s3rver.sh || echo "Warning: start_s3rver.sh timed out or failed"

# Playwright's installed chromium version may not match the version expected by
# the current playwright package. Symlink the available version so that
# `npx playwright screenshot` and similar commands work without downloading.
EXPECTED_DIR="$HOME/.cache/ms-playwright/chromium_headless_shell-1208"
AVAILABLE_DIR="$HOME/.cache/ms-playwright/chromium_headless_shell-1194"
if [ -d "$AVAILABLE_DIR/chrome-linux" ] && [ ! -x "$EXPECTED_DIR/chrome-headless-shell-linux64/chrome-headless-shell" ]; then
    mkdir -p "$EXPECTED_DIR/chrome-headless-shell-linux64"
    for f in "$AVAILABLE_DIR/chrome-linux"/*; do
        ln -sf "$f" "$EXPECTED_DIR/chrome-headless-shell-linux64/$(basename "$f")"
    done
    ln -sf "$AVAILABLE_DIR/chrome-linux/headless_shell" "$EXPECTED_DIR/chrome-headless-shell-linux64/chrome-headless-shell"
fi
