#! /bin/bash

echo TRAVIS $TRAVIS
echo TRAVIS_JOB_ID $TRAVIS_JOB_ID
echo TRAVIS_PULL_REQUEST $TRAVIS_PULL_REQUEST
echo TRAVIS_BRANCH $TRAVIS_BRANCH

cd /PrairieLearn
ls -l coverage/lcov.info
cat coverage/lcov.info | ./node_modules/.bin/coveralls -v
