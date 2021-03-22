#!/bin/bash

if git diff --exit-code remotes/origin/master...HEAD -- images/plbase; then
  echo "prairielearn/plbase files not modified; no rebuild required"
else
  echo "prairielearn/plbase requires a rebuild"
  docker build ./images/plbase -t prairielearn/plbase
fi
