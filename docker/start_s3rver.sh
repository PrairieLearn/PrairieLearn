#!/bin/bash

# exit if s3rver is already running
PID=$(lsof -i :5000 -t)
if [ -n "$PID" ]; then
    # Check if this process is actually s3rver
    PROCESS_NAME=$(ps -p $PID -o args=)
    if grep -q "[s]3rver" <<< $PROCESS_NAME; then
        exit
    fi

    # Warn the user that the port is already in use
    echo "Cannot start s3rver since port 5000 is already in use by process $PID."
    echo "Please stop the process and try again."

    # If the user is on macOS, warn them that this might be caused by AirPlay
    # Receiver.
    if [ "$(uname)" == "Darwin" ] && grep -q "ControlCenter" <<< $PROCESS_NAME; then
        echo "This might be caused by AirPlay Receiver."
        echo "For more details, see the following:"
        echo "https://apple.stackexchange.com/questions/431154/should-controlcenter-app-listen-to-port-5000-tcp-on-a-normal-macos-monterey-syst"
    fi
    exit 1
fi

mkdir -p ./s3rver
node_modules/.bin/s3rver --directory ./s3rver --port 5000 --configure-bucket workspaces --configure-bucket chunks --configure-bucket file-store --configure-bucket workspace-logs > /dev/null &

# wait for s3rver to start
until lsof -i :5000 > /dev/null ; do sleep 1 ; done
