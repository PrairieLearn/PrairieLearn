#!/bin/bash

cd /PrairieLearn
docker/start_s3rver.sh
docker/start_postgres.sh
docker/start_redis.sh

git config --global user.email "dev@illinois.edu"
git config --global user.name "Dev User"

npm test
