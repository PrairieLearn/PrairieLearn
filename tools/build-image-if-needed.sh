#!/bin/bash

set -ex

if [ "$#" -ne 2 ]; then
  echo "USAGE: $0 build_directory tag_name" >& 2
  echo "Example: $0 images/plbase prairielearn/plbase" >& 2
  exit 1
fi

BUILD_DIRECTORY=$1
TAG_NAME=$2

if git diff --exit-code remotes/origin/master...HEAD -- ${BUILD_DIRECTORY}; then
  echo "${BUILD_DIRECTORY} files not modified; no rebuild required"
else
  echo "${BUILD_DIRECTORY} files modified; ${TAG_NAME} requires a rebuild"
  docker build ${BUILD_DIRECTORY} -t ${TAG_NAME}
fi
