#!/bin/bash

cd /PrairieLearn


if [[ -f /efs/container/config.json ]] ; then
    # we are running in production mode
    node server --config /efs/container/config.json
else
    # we are running in local development mode
    docker/start_postgres.sh

    # Uncomment to start redis to test message passing
    # redis-server --daemonize yes

    if [[ -n $NODEMON ]] && [[ $NODEMON == "true" ]]; then
        npm run start-nodemon
    else
        npm start
    fi
fi
