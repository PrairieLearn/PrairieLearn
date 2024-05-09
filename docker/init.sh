#!/bin/bash

set -e

echo 'Starting PrairieLearn...'

cd /PrairieLearn
make -s start-support

if [[ $NODEMON == "true" || DEV == "true" ]]; then
    make migrate-dev > /dev/null
    make dev-all
else
    make migrate > /dev/null
    make start-all
fi
