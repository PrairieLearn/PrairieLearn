#!/bin/bash

if [ "$#" -ne 1 ]; then
  echo: "USAGE: $0 environment_name" >& 2
  echo "environment_name should correspond to directory environments/environment_name"
  exit 1
fi

if [ ! -d "environments/$1/" ]; then
  echo "ERR: environments/$1 does not exist" >& 2
  exit 2
fi

if [ ! -f "environments/$1/Dockerfile" ]; then
  echo "ERR: environments/$1/Dockerfile is not present"
  exit 3
fi

cd environments/$1/
docker build . -t prairielearn/$1:latest

if [ $? -ne 0 ]; then
  echo "ERR: building image failed. skipping upload."
  exit 4
fi

docker push prairielearn/$1
