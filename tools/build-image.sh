#!/bin/bash

set -ex

if [ "$#" -ne 1 ]; then
  echo "USAGE: $0 image_name" >& 2
  echo "image_name should correspond to directory images/image_name"
  exit 1
fi

if [ ! -d "images/$1/" ]; then
  echo "ERR: images/$1 does not exist" >& 2
  exit 2
fi

if [ ! -f "images/$1/Dockerfile" ]; then
  echo "ERR: images/$1/Dockerfile does not exist" >& 2
  exit 3
fi

cd images/$1/
docker build . -t prairielearn/$1:latest

echo "IMPORTANT: This build script should only be used to verify that your \
image will build successfully; this image is not pushed to your container \
respository. When running locally, PrairieLearn will always pull the image \
specified in your question from your container repository. This is to mirror \
the behavior in production. To push your image to DockerHub, use \
'release-image.sh' instead."
