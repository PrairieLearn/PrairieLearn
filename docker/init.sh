#!/bin/bash

if [[ -n $DELAYED_START ]]; then
    echo "Waiting $DELAYED_START seconds to start"
    sleep $DELAYED_START
fi
cd /PrairieLearn


if [[ -f /efs/container/config.json ]] ; then
    # we are running in production mode
    node server --config /efs/container/config.json
else
    # we are running in local development mode
    docker/start_s3rver.sh
    docker/start_postgres.sh
    docker/gen_ssl.sh
    docker/start_redis.sh

    if [[ $NODEMON == "true" ]]; then
        npm run start-nodemon
    else
        npm start
    fi
fi
