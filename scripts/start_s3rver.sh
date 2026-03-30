#!/bin/bash

# When the Docker image runs on an Ubuntu 24.10 host, `lsof` will hang and
# prevent the container from starting. This is possibly a bug in the
# `amazonlinux:2023` base image. See the following issue:
# https://github.com/amazonlinux/container-images/issues/123
ulimit -Sn 4096

# exit if s3rver is already running
# Use curl instead of lsof to avoid hanging in some environments.
echo "[start_s3rver] Checking if port 5000 is in use..."
if curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:5000 2>/dev/null | grep -q ".*"; then
    echo "[start_s3rver] Port 5000 is responding, checking process..."
    # Something is listening on port 5000; check if it's s3rver
    PID=$(timeout 5 lsof -i :5000 -t 2>/dev/null)
    if [ -n "$PID" ]; then
        PROCESS_NAME=$(ps -p $PID -o args= 2>/dev/null)
        if grep -q "[s]3rver" <<< "$PROCESS_NAME"; then
            echo "[start_s3rver] s3rver already running (PID $PID), skipping"
            exit
        fi

        # Warn the user that the port is already in use
        echo "Cannot start s3rver since port 5000 is already in use by process $PID."
        echo "Please stop the process and try again."

        # If the user is on macOS, warn them that this might be caused by AirPlay
        # Receiver.
        if [ "$(uname)" == "Darwin" ] && grep -q "ControlCenter" <<< "$PROCESS_NAME"; then
            echo "This might be caused by AirPlay Receiver."
            echo "For more details, see the following:"
            echo "https://apple.stackexchange.com/questions/431154/should-controlcenter-app-listen-to-port-5000-tcp-on-a-normal-macos-monterey-syst"
        fi
        exit 1
    fi
fi

echo "[start_s3rver] Starting s3rver..."
mkdir -p ./s3rver
node_modules/.bin/s3rver --address 127.0.0.1 --port 5000 --directory ./s3rver --configure-bucket workspaces --configure-bucket chunks --configure-bucket file-store --configure-bucket workspace-logs > /dev/null &

# wait for s3rver to start (timeout after 10 seconds)
echo "[start_s3rver] Waiting for s3rver to be ready..."
SECONDS=0
until curl -s -o /dev/null http://127.0.0.1:5000 2>/dev/null; do
    if [ "$SECONDS" -ge 10 ]; then
        echo "[start_s3rver] ERROR: s3rver did not start within 10 seconds"
        exit 1
    fi
    sleep 1
done
echo "[start_s3rver] s3rver is ready (took ${SECONDS}s)"
