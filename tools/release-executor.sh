#!/bin/bash

# Similar to the build-executor script, except this one will also push the
# image to the container registry.

if [ ! -f "EXECUTOR_VERSION" ]; then
  echo "Could not find EXECUTOR_VERSION file" >& 2
  exit 1
fi

VERSION=`cat EXECUTOR_VERSION`

echo "Building and tagging prairielearn/executor:$VERSION"

docker build ./images/executor --tag "prairielearn/executor:$VERSION"

if [ $? -ne 0 ]; then
  echo "Image failed to build; not pushing to container registry." >& 2
  exit 2
fi

echo "Pushing prairielearn/executor:$VERSION to image repository"

docker push "prairielearn/executor:$VERSION"
