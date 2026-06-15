#!/bin/bash

set -ex

# This script is designed to be run inside a GitHub Action job. It
# checks whether the current commit has modified anything under the
# given CHECK_PATH. If so, it sets the given ENV_VAR to "true".

if [ "$#" -ne 2 ]; then
    echo "USAGE: $0 check_path env_var" >&2
    echo "Example: $0 images/executor executor_modified" >&2
    exit 1
fi

CHECK_PATH=$1
ENV_VAR=$2

BRANCH="$(git rev-parse --abbrev-ref HEAD)"

# If this script is being run *on* the master branch, then we want to diff
# with the previous commit on master. Otherwise, we diff with master itself.
if [[ "$BRANCH" == "master" ]]; then
    DIFF_SOURCE="HEAD^1"
else
    DIFF_SOURCE="remotes/origin/master"
fi

if git diff --exit-code $DIFF_SOURCE..HEAD -- ${CHECK_PATH}; then
    echo "${CHECK_PATH} files not modified"
else
    echo "${CHECK_PATH} files modified"
    echo "${ENV_VAR}=true" >> $GITHUB_ENV
fi
