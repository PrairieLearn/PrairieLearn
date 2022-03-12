#!/bin/bash

echo 'Starting PrairieLearn...'
if [[ $NODEMON == "true" ]]; then
    make -s -C /PrairieLearn -j 2 start-workspace-host start-nodemon
else
    make -s -C /PrairieLearn -j 2 start-workspace-host start
fi
