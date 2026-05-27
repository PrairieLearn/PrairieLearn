#!/bin/bash

# This script is specialized for the default Claude Code remote environment.

set -euo pipefail

# Only run in remote (Claude Code on the web) environments
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
    exit 0
fi

cd "$CLAUDE_PROJECT_DIR"

SETUP_DONE_MARKER="/tmp/.claude-session-setup-done"

# On resume, just ensure services are running.
if [ -f "$SETUP_DONE_MARKER" ]; then
    make start-postgres
    make start-redis
    exit 0
fi

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

# Run commands independently for better timeout control
make python-deps
setup_succeeded=true
time timeout 120 yarn || setup_succeeded=false

# Start the support services.
make start-postgres
make start-redis
# Starting s3rver in the session startup hook causes issues, so we wait to start it until
# `make dev` is run.

# Playwright blocks downloads from within a remote Claude Code environment,
# so we need to symlink the already-installed version to the expected location.
PW_BROWSERS_JSON="$CLAUDE_PROJECT_DIR/node_modules/playwright-core/browsers.json"
if [ -f "$PW_BROWSERS_JSON" ]; then
    EXPECTED_REV=$(python3 -c "import json; bs=json.load(open('$PW_BROWSERS_JSON'))['browsers']; print(next(b['revision'] for b in bs if b['name']=='chromium-headless-shell'))")
    EXPECTED_DIR="$HOME/.cache/ms-playwright/chromium_headless_shell-$EXPECTED_REV"

    if [ ! -x "$EXPECTED_DIR/chrome-headless-shell-linux64/chrome-headless-shell" ]; then
        # Find the latest available installed chromium headless shell
        AVAILABLE_DIR=$(ls -d "$HOME/.cache/ms-playwright/chromium_headless_shell-"*/chrome-linux 2> /dev/null | sort -V | tail -1)
        if [ -n "$AVAILABLE_DIR" ]; then
            mkdir -p "$EXPECTED_DIR/chrome-headless-shell-linux64"
            for f in "$AVAILABLE_DIR"/*; do
                ln -sf "$f" "$EXPECTED_DIR/chrome-headless-shell-linux64/$(basename "$f")"
            done
            ln -sf "$AVAILABLE_DIR/headless_shell" "$EXPECTED_DIR/chrome-headless-shell-linux64/chrome-headless-shell"
        fi
    fi
fi

time timeout 120 make build || setup_succeeded=false

if [ "$setup_succeeded" = true ]; then
    touch "$SETUP_DONE_MARKER"
fi
