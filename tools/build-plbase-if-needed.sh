#!/bin/bash

if git diff --exit-code master -- environments/centos7-plbase; then
  echo "prairielearn/centos7-plbase files not modified; no rebuild required"
else
  echo "prairielearn/centos7-plbase requires a rebuild"
  docker build ./environments/centos7-plbase -t prairielearn/centos7-plbase
fi
