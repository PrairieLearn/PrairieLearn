#!/bin/bash

echo 'Starting PrairieLearn...'

cd /PrairieLearn
make -s start-support
node server.js --migrate-and-exit >/dev/null

if [[ $NODEMON == "true" ]]; then
    # start-nodemon is listed first so it can use standard input
    make -s -j 2 start-nodemon workspace-host-start
else
    make -s -j 2 start workspace-host-start
fi
