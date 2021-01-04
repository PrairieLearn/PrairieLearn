#!/bin/bash

mkdir -p /s3rver
npx s3rver --directory /s3rver --port 5000 --configure-bucket workspaces --configure-bucket chunks --configure-bucket file-store > /dev/null &
