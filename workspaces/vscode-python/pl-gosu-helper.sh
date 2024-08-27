#!/bin/bash

# The purpose of this script is to prevent subtle issues that might occur if
# you are testing in the local PrairieLearn Docker container and it attempts
# to launch workspaces as root.

if [ "$(id -u)" -eq 0 ] ; then
    NORMAL_USER="$(id -un 1001)"
    set -eu
    find "/home/${NORMAL_USER:-NO_USER_1001}" -not -user 1001 -exec chown 1001:1001 {} +
    set +eu
    exec gosu 1001:1001 "$@"
elif [ "$(id -u)" -eq 1001 ] ; then
    exec "$@"
else
    echo " ERROR:" >&2
    echo "This image can only be executed as user 1001 or as user 0 (root)." >&2
    echo "Running as user 0 will automatically step down to run as user 1001." >&2
    echo "Cannot continue as current user $(id -u); exiting." >&2
    exit 1
fi
