#!/bin/bash

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
