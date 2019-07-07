#!/bin/bash

cd /PrairieLearn
docker/start_postgres.sh

git config --global user.email "dev@illinois.edu"
git config --global user.name "Dev User"

npm test
