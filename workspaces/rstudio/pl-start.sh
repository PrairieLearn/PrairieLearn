#!/bin/bash

# This variable isn't meant to be secure. It's a stopgap measure to avoid errors in case
# RStudio Server's DISABLE_AUTH has issues.
export PASSWORD="placeholder-$RANDOM$RANDOM"

# We replace the base URL for the workspace dynamically by patching the
# nginx.conf file at startup time. The script waits for RStudio before
# starting Nginx so that PrairieLearn's workspace host will wait gracefully
# (it's waiting for the Nginx port, not the RStudio port).

mkdir -p /var/pl-var || exit 1
export TRIMMED_BASE_URL=${WORKSPACE_BASE_URL##/}
TRIMMED_BASE_URL=${TRIMMED_BASE_URL%%/}
echo "Trimmed base URL: $TRIMMED_BASE_URL"
envsubst '$TRIMMED_BASE_URL' < /etc/nginx/nginx.conf > /tmp/nginx.conf || exit 1
cp -f /tmp/nginx.conf /etc/nginx/nginx.conf || exit 1
rm -f /tmp/nginx.conf

# Optionally follow logs in the PL log viewer. May use more resources.
# {
#     tail -F /var/log/nginx/access.log /var/log/nginx/error.log &
#     sleep 1s
# }

# Wait in the background for RStudio to finish starting, then run Nginx.
{
    while ! s6-svstat -o up /var/run/s6/services/rstudio ; do
        sleep 0.5s
    done
    sleep 1s
    service nginx start
} &

# Begin the RStudio session as the primary process.
exec /init
