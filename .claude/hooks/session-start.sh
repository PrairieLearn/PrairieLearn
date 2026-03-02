#!/bin/bash
set -euo pipefail

# Only run in remote (Claude Code on the web) environments
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR"

# Add PostgreSQL binaries to PATH (needed for pg_ctl, initdb, etc.)
export PATH="/usr/lib/postgresql/16/bin:$PATH"
echo "export PATH=\"/usr/lib/postgresql/16/bin:\$PATH\"" >> "$CLAUDE_ENV_FILE"

# Install system dependencies needed for Python packages (pygraphviz)
apt-get update -qq && apt-get install -y -qq graphviz libgraphviz-dev > /dev/null 2>&1

# Install Node.js dependencies (Yarn 4 workspaces)
yarn install

# Update uv if needed and install Python dependencies
uv self update
uv sync --compile-bytecode

# Build TypeScript packages
yarn turbo run build --output-logs=errors-only

# Start support services (Postgres, Redis, S3rver) needed for tests
# Start Postgres (pg_ctl needs to be in PATH for the postgres user)
if ! pg_isready -q 2>/dev/null; then
  export PGDATA="${PGDATA:-/var/postgres}"
  mkdir -p "$PGDATA"
  chown -f postgres:postgres "$PGDATA"
  if ! su postgres -c "PATH=$PATH pg_ctl status" > /dev/null 2>&1; then
    su postgres -c "PATH=$PATH initdb" > /dev/null 2>&1 || true
    su postgres -c "PATH=$PATH pg_ctl --silent --log=${PGDATA}/postgresql.log start"
    until pg_isready -q; do sleep 1; done
    su postgres -c "PATH=$PATH createuser -s root" 2>/dev/null || true
  else
    su postgres -c "PATH=$PATH pg_ctl --silent --log=${PGDATA}/postgresql.log start"
    until pg_isready -q; do sleep 1; done
  fi
fi

# Start Redis
if ! redis-cli ping > /dev/null 2>&1; then
  redis-server --daemonize yes > /dev/null
fi

# Start S3rver
if ! lsof -i :5000 -t > /dev/null 2>&1; then
  mkdir -p ./s3rver
  node_modules/.bin/s3rver --address 127.0.0.1 --port 5000 --directory ./s3rver \
    --configure-bucket workspaces --configure-bucket chunks \
    --configure-bucket file-store --configure-bucket workspace-logs > /dev/null &
  until lsof -i :5000 > /dev/null 2>&1; do sleep 1; done
fi
