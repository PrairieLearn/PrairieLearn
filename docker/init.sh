#!/bin/bash

echo 'Starting PrairieLearn...'

make -s -C /PrairieLearn start-support
cd /PrairieLearn
node server.js --migrate-and-exit >/dev/null

if [[ $NODEMON == "true" ]]; then
    # start-nodemon is listed first so it can use standard input
    make -s -C /PrairieLearn -j 2 start-nodemon start-workspace-host-nodemon
else
    make -s -C /PrairieLearn -j 2 start start-workspace-host
fi
