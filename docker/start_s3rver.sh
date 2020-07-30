#!/bin/bash

mkdir -p /s3rver
npx s3rver --silent --data /s3rver --port 5000 --configure-bucket workspaces
