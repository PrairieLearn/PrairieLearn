#!/bin/bash

if [ "$#" -ne 1 ]; then
  echo "USAGE: $0 environment_name" >& 2
  echo "environment_name should correspond to directory environments/environment_name"
  exit 1
fi

if [ ! -d "environments/$1/" ]; then
  echo "ERR: environments/$1 does not exist" >& 2
  exit 2
fi

if [ ! -f "environments/$1/Dockerfile" ]; then
  echo "ERR: environments/$1/Dockerfile does not exist" >& 2
  exit 3
fi

cd environments/$1/
docker build . -t prairielearn/$1:latest

echo "IMPORTANT: This build script should only be used to verify that your \
image will build successfully; this image is not pushed to your container \
respository. When running locally, PrairieLearn will always pull the image \
specified in your question from your container repository. This is to mirror \
the behavior in production. To push your image to DockerHub, use \
'release-image.sh' instead."
