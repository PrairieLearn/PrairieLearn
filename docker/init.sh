#!/bin/bash

echo 'Starting PrairieLearn...'

cd /PrairieLearn
make -s start-support
node server.js --migrate-and-exit >/dev/null

if [[ $NODEMON == "true" ]]; then
    # `dev` is listed first so it can use standard input
    make -s -j 2 dev dev-workspace-host
else
    make -s -j 2 start start-workspace-host
fi
