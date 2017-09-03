#!/bin/bash

cd /PrairieLearn
docker/start_postgres.sh
npm test
cat ./coverage/lcov.info | ./node_modules/.bin/coveralls
