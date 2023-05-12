#!/bin/bash

set -e

echo 'Starting PrairieLearn...'

cd /PrairieLearn
make -s start-support

if [[ $NODEMON == "true" || DEV == "true" ]]; then
    make migrate-dev > /dev/null
    # `dev` is listed first so it can use standard input
    make -s -j 2 dev dev-workspace-host
else
    make migrate > /dev/null
    make -s -j 2 start start-workspace-host
fi
