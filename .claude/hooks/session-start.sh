#!/bin/bash
set -euo pipefail

# Only run in remote (Claude Code on the web) environments
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
    exit 0
fi

cd "$CLAUDE_PROJECT_DIR"

# Make PostgreSQL binaries available system-wide (needed by start_postgres.sh
# which runs commands as the postgres user via su)
for bin in /usr/lib/postgresql/16/bin/*; do
    ln -sf "$bin" /usr/local/bin/
done

# Install system dependencies needed for Python packages (e.g. pygraphviz)
apt-get update -qq && apt-get install -y -qq graphviz libgraphviz-dev > /dev/null 2>&1

# Update uv to meet the minimum version required by the project
uv self update

# Install JS dependencies, Python dependencies, and build the project
make deps

# Start support services (Postgres, Redis, S3) needed for tests
make start-support
