#!/bin/bash

set -ex

# This script is designed to be run inside a GitHub Action job. It
# checks whether the current commit has modified anything under the
# given CHECK_PATH. If so, it sets the given ENV_VAR to "true".

if [ "$#" -ne 2 ]; then
    echo "USAGE: $0 check_path env_var" >& 2
    echo "Example: $0 images/plbase plbase_modified" >& 2
    exit 1
fi

CHECK_PATH=$1
ENV_VAR=$2

BRANCH="$(git rev-parse --abbrev-ref HEAD)"

# The branch we compare to depends on the current branch:
#
# - If this script is being run *on* the master branch, then we want to diff
#   with the previous commit on master.
# - If this script is being run on a GitHub merge queue branch, then we'll
#   diff with whatever the previous commit was. We'll trust that the merge
#   queue will have tested all previous commits correctly.
# - Otherwise, we diff with master itself.
if [[ "$BRANCH" == "master" ]] || [[ "$BRANCH" =~ ^gh-readonly-queue/ ]]; then
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
