#!/bin/bash

# The purpose of this script is to prevent subtle issues that might occur if
# you are testing in the local PrairieLearn Docker container and it attempts
# to launch workspaces as root.

# Exporting these variables shouldn't be strictly necessary, but there are
# some edge cases where Jupyter's own entrypoint scripts behave better with
# them set, and it also quiets some warnings.
export NB_UID=1001 NB_GID=1001

if [ "$(id -u)" -eq 0 ]; then
    NORMAL_USER="$(id -un $NB_UID)"
    if [[ -z "$NORMAL_USER" ]]; then
        echo "Error: Expected to find a username for UID $NB_UID" >&2
        exit 1
    fi
    set -eu
    find "/home/${NORMAL_USER:-NORMAL_USER_NOT_FOUND}" -not -user "$NB_UID" -exec chown "$NB_UID":"$NB_GID" {} +
    set +eu
    exec gosu "$NB_UID":"$NB_GID" "$@"
elif [ "$(id -u)" -eq "$NB_UID" ]; then
    exec "$@"
else
    echo " ERROR:" >&2
    echo "This image can only be executed as user $NB_UID or as user 0 (root)." >&2
    echo "Running as user 0 will automatically step down to run as user $NB_UID." >&2
    echo "Cannot continue as current user $(id -u); exiting." >&2
    exit 1
fi
