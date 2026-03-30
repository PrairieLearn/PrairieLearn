#!/bin/bash

# This script is specialized for the default Claude Code remote environment.

set -uo pipefail

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
echo "[session-start] Installing system packages..."
timeout 30 bash -c 'apt-get update -qq && apt-get install -y -qq graphviz libgraphviz-dev postgresql-16-pgvector 2>&1' || echo "[session-start] WARNING: apt-get timed out or failed"
echo "[session-start] System packages done"

# Load nvm
. /opt/nvm/nvm.sh

# nvm is already installed in the default Claude Code environment, but we need to install Node.js 24.
echo "[session-start] Installing Node.js 24..."
timeout 30 bash -c '. /opt/nvm/nvm.sh && nvm install 24 && nvm alias default 24' || echo "[session-start] WARNING: nvm install timed out or failed"
nvm use 24 2>/dev/null || true
echo "[session-start] Node.js done"

# uv is already installed in the default Claude Code environment, but we need to update it to the latest version.
# https://github.com/astral-sh/uv/issues/14016#issuecomment-2969548188
echo "[session-start] Updating uv..."
timeout 30 bash -c '(cd /tmp && uv pip install --system --reinstall uv)' || echo "[session-start] WARNING: uv update timed out or failed"
rm -f /root/.local/bin/uv # Uninstall the outdated uv binary.
echo "[session-start] uv done"

echo "[session-start] Running make deps..."
timeout 60 make deps || echo "[session-start] WARNING: make deps timed out or failed"
echo "[session-start] make deps done"

echo "[session-start] Starting postgres..."
timeout 30 scripts/start_postgres.sh || echo "[session-start] WARNING: postgres timed out or failed"
echo "[session-start] Starting redis..."
timeout 10 scripts/start_redis.sh || echo "[session-start] WARNING: redis timed out or failed"
echo "[session-start] Starting s3rver..."
timeout 30 scripts/start_s3rver.sh || echo "[session-start] WARNING: s3rver timed out or failed"
echo "[session-start] All support services done"

# Playwright's installed chromium version may not match the version expected by
# the current playwright package. Symlink the available version so that
# `npx playwright screenshot` and similar commands work without downloading.
PW_BROWSERS_JSON="$CLAUDE_PROJECT_DIR/node_modules/playwright-core/browsers.json"
if [ -f "$PW_BROWSERS_JSON" ]; then
    EXPECTED_REV=$(python3 -c "import json; bs=json.load(open('$PW_BROWSERS_JSON'))['browsers']; print(next(b['revision'] for b in bs if b['name']=='chromium-headless-shell'))")
    EXPECTED_DIR="$HOME/.cache/ms-playwright/chromium_headless_shell-$EXPECTED_REV"

    if [ ! -x "$EXPECTED_DIR/chrome-headless-shell-linux64/chrome-headless-shell" ]; then
        # Find the latest available installed chromium headless shell
        AVAILABLE_DIR=$(ls -d "$HOME/.cache/ms-playwright/chromium_headless_shell-"*/chrome-linux 2>/dev/null | sort -V | tail -1)
        if [ -n "$AVAILABLE_DIR" ]; then
            mkdir -p "$EXPECTED_DIR/chrome-headless-shell-linux64"
            for f in "$AVAILABLE_DIR"/*; do
                ln -sf "$f" "$EXPECTED_DIR/chrome-headless-shell-linux64/$(basename "$f")"
            done
            ln -sf "$AVAILABLE_DIR/headless_shell" "$EXPECTED_DIR/chrome-headless-shell-linux64/chrome-headless-shell"
        fi
    fi
fi
