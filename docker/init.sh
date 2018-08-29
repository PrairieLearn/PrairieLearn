#!/bin/bash

cd /PrairieLearn

if [[ -f /efs/container/config.json ]] ; then
    # we are running in production mode
    node server --config /efs/container/config.json
else
    # we are running in local development mode

    # To skip starting the Postgres server inside this
    # container, set NO_POSTGRES=true
    if [[ -z $NO_POSTGRES ]] || [[ $NO_POSTGRES != "true" ]]; then
        docker/start_postgres.sh
    fi

    # If run with NODEMON=true, PrairieLearn will restart any time code is changed
    if [[ -n $NODEMON ]] && [[ $NODEMON == "true" ]]; then
        npm run start-nodemon
    else
        npm start
    fi
fi
