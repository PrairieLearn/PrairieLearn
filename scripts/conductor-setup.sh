#!/bin/bash
set -e

# Install dependencies
make deps
make e2e-deps

# Create workspace-specific database if CONDUCTOR_WORKSPACE_NAME is set
if [ -n "$CONDUCTOR_WORKSPACE_NAME" ]; then
    DB_NAME="prairielearn_$(echo "$CONDUCTOR_WORKSPACE_NAME" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9_]/_/g')"

    if ! psql -U postgres -lqt | cut -d \| -f 1 | grep -qw "$DB_NAME"; then
        echo "Creating database: $DB_NAME"
        createdb -U postgres "$DB_NAME"
    else
        echo "Database $DB_NAME already exists"
    fi
fi
