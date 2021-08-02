#!/bin/bash

echo 'Starting PrairieLearn...'

if [[ -n $DELAYED_START ]]; then
    echo "Waiting $DELAYED_START seconds to start"
    sleep $DELAYED_START
fi
cd /PrairieLearn


# kill any containers with a name like workspace-*
if [ -e /var/run/docker.sock ] ; then
    CONTAINERS=$(docker ps -aq --filter "name=workspace-")
fi
if [[ ! -z "$CONTAINERS" ]] ; then
    echo Killing existing workspace containers:
    echo $CONTAINERS
    docker kill $CONTAINERS
    docker rm $CONTAINERS
fi


docker/start_support.sh

if [[ $DONT_START_WORKSPACE_HOST_IN_INIT != "true" ]]; then
    node workspace_host/interface &
fi

if [[ $NODEMON == "true" ]]; then
    make start-nodemon
else
    make --silent start
fi
