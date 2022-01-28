#!/bin/bash

# FIXME: temporary check until all developers have upgraded their docker images
# FIXME: should be removed soon
if ! command -v lsof > /dev/null ; then
    echo "Docker image is outdated. Please run:"
    echo -e "\tdocker pull prairielearn/prairielearn"
    exit 1
fi

# exit if s3rver is already running
if lsof -i :5000 > /dev/null ; then
    exit
fi

mkdir -p ./s3rver
node_modules/.bin/s3rver --directory ./s3rver --port 5000 --configure-bucket workspaces --configure-bucket chunks --configure-bucket file-store > /dev/null &

# wait for s3rver to start
until lsof -i :5000 > /dev/null ; do sleep 1 ; done
