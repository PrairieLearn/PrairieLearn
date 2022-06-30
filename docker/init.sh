#!/bin/bash

echo 'Starting PrairieLearn...'
if [[ $NODEMON == "true" ]]; then
    # start-nodemon is listed first so it can use standard input
    make -s -C /PrairieLearn -j 2 start-nodemon start-workspace-host
else
    make -s -C /PrairieLearn -j 2 start start-workspace-host
fi
