#!/bin/bash
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
apt-get update -qq && apt-get install -y -qq graphviz libgraphviz-dev 2>&1

# nvm is already installed in the default Claude Code environment, but we need to install Node.js 24.
nvm install 24
nvm alias default 24

# uv is already installed in the default Claude Code environment, but we need to update it to the latest version.
uv self update

make deps
make start-support
