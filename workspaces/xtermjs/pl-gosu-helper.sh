#!/bin/bash

# This script is used as the entrypoint for the PrairieLearn workspace
# containers. It provides a consistent view of the workspace running as the user
# with UID 1001, regardless of whether the container is started as root
# (typically in dev mode) or as UID 1001 (the default setting in production).

if [ "$(id -u)" -eq 0 ]; then
    NORMAL_USER="$(id -un 1001)"
    set -eu
    find "/home/${NORMAL_USER:-NO_USER_1001}" \( -not -user 1001 -o -not -group 1001 \) -exec chown 1001:1001 {} +
    set +eu
    exec gosu 1001:1001 "$@"
elif [ "$(id -u)" -eq 1001 ]; then
    exec "$@"
else
    echo " ERROR:" >&2
    echo "This image can only be executed as user 1001 or as user 0 (root)." >&2
    echo "Running as user 0 will automatically step down to run as user 1001." >&2
    echo "Cannot continue as current user $(id -u); exiting." >&2
    exit 1
fi
