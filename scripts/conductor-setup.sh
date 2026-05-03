#!/bin/bash
set -e

# Install dependencies
make deps
make e2e-deps

# Create workspace-specific database if CONDUCTOR_WORKSPACE_NAME is set
if [ -n "$CONDUCTOR_WORKSPACE_NAME" ]; then
    DB_SUFFIX="$(echo "$CONDUCTOR_WORKSPACE_NAME" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9_]/_/g' | cut -c1-50)"
    DB_NAME="prairielearn_${DB_SUFFIX}"

    # Always recreate the workspace DB to guarantee a clean starting state.
    echo "Recreating database: $DB_NAME"
    dropdb -U postgres --if-exists --force "$DB_NAME"
    createdb -U postgres "$DB_NAME"
fi
