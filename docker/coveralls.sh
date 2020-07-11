#! /bin/bash

cd /PrairieLearn
cat coverage/lcov.info | ./node_modules/.bin/coveralls -v

# do not block CI even if coveralls fails
exit 0
