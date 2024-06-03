#!/bin/bash

set -e

echo 'Starting PrairieLearn...'

cd /PrairieLearn
make -s start-support

if [ -S /var/run/docker.sock ] ; then 
    SUFFIX="-all"
else
    echo "Running PrairieLearn without support for external graders and workspaces." 1>&2
    echo "To enable external graders and workspaces, follow the instructions here:" 1>&2
    echo "https://prairielearn.readthedocs.io/en/latest/installing/#support-for-external-graders-and-workspaces" 1>&2
fi

if [[ $NODEMON == "true" || $DEV == "true" ]]; then
    make migrate-dev > /dev/null
    make dev$SUFFIX
else
    make migrate > /dev/null
    make start$SUFFIX
fi
