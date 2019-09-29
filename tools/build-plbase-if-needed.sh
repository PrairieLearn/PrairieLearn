#!/bin/bash

if git diff --exit-code remotes/origin/master...HEAD -- images/centos7-plbase; then
  echo "prairielearn/centos7-plbase files not modified; no rebuild required"
else
  echo "prairielearn/centos7-plbase requires a rebuild"
  docker build ./images/centos7-plbase -t prairielearn/centos7-plbase
fi
