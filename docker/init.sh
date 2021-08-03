#!/bin/bash

echo 'Starting PrairieLearn...'
make -s -C /PrairieLearn start-workspace-host
if [[ $NODEMON == "true" ]]; then
    make -s -C /PrairieLearn start-nodemon
else
    make -s -C /PrairieLearn start
fi
