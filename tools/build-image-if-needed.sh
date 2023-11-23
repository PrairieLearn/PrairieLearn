#!/bin/bash

set -ex

if [ "$#" -ne 2 ]; then
  echo "USAGE: $0 build_directory tag_name" >& 2
  echo "Example: $0 images/plbase prairielearn/plbase" >& 2
  exit 1
fi

BUILD_DIRECTORY=$1
TAG_NAME=$2

BRANCH="$(git rev-parse --abbrev-ref HEAD)"

# If this script is being run *on* the master branch, then we want to diff
# with the previous commit on master. Otherwise, we diff with master itself.
if [[ "$BRANCH" == "master" ]]; then
  DIFF_SOURCE="HEAD^1"
else
  DIFF_SOURCE="remotes/origin/master"
fi

if git diff --exit-code $DIFF_SOURCE...HEAD -- ${BUILD_DIRECTORY}; then
  echo "${BUILD_DIRECTORY} files not modified; no rebuild required"
else
  echo "${BUILD_DIRECTORY} files modified; ${TAG_NAME} requires a rebuild"
  docker buildx build ${BUILD_DIRECTORY} -t ${TAG_NAME}
fi

