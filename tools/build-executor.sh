#!/bin/bash

# This script will build the prairielearn/executor image and tag it
# appropriately based on the contents of the EXECUTOR_VERSION file at the
# root of the repository.

if [ ! -f "EXECUTOR_VERSION" ]; then
  echo "Could not find EXECUTOR_VERSION file" >& 2
  exit 1
fi

VERSION=`cat EXECUTOR_VERSION`

echo "Building and tagging prairielearn/executor:$VERSION"

docker build ./images/executor --tag "prairielearn/executor:$VERSION"
