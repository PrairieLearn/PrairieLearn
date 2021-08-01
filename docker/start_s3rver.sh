#!/bin/bash

# exit if s3rver is already running
if lsof -i :5000 > /dev/null ; then
    exit
fi

mkdir -p /s3rver
node_modules/.bin/s3rver --directory /s3rver --port 5000 --configure-bucket workspaces --configure-bucket chunks --configure-bucket file-store > /dev/null &

