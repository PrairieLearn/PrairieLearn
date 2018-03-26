#! /bin/bash

cd /PrairieLearn
cat coverage/lcov.info | ./node_modules/.bin/coveralls -v
