#!/bin/bash

mkdir -p /s3rver
npx s3rver --silent --directory /s3rver --port 5000 --configure-bucket workspaces --configure-bucket prairielearn.dev.file-store &
