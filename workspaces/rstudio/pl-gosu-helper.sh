#!/bin/bash

# The purpose of this script is to prevent subtle issues that might occur if
# you are testing in the local PrairieLearn Docker container and it attempts
# to launch workspaces as root.

# Put a line like "ENV PL_USER rstudio" or "ENV PL_USER coder"
# (whatever is appropriate) in your Dockerfile. This name should
# match user 1001.

if [ "${PL_USER:-}" = "" ]; then
    echo " ERROR: Must define env var PL_USER with user 1001's intended name. Exiting." >&2
    exit 1
fi
if [ "${PL_USER:-}" = "root" ]; then
    echo " ERROR: Must not specify \"root\" as PL_USER. Exiting." >&2
    exit 1
fi
if [ $(id -u) -eq 0 ] ; then
    set -eu
    chown -R 1001:1001 "/home/$PL_USER"
    set +eu
    exec gosu 1001:1001 "$@"
elif [ $(id -u) -eq 1001 ] ; then
    exec "$@"
else
    echo " ERROR:" >&2
    echo "This image can only be executed as user 1001 or as user 0 (root)." >&2
    echo "Running as user 0 will automatically step down to run as user 1001." >&2
    echo "Cannot continue as current user $(id -u); exiting." >&2
    exit 1
fi
