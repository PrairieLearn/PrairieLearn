#!/bin/bash

TMUX_CONF=/PrairieLearn/.tmux.conf
[[ -f $TMUX_CONF ]] && args=(-f $TMUX_CONF) || args=()

# kill any containers with a name like workspace-*
CONTAINERS=$(docker ps -aq --filter "name=workspace-")
if [[ ! -z "$CONTAINERS" ]] ; then
   echo Killing existing workspace containers: $CONTAINERS
   docker kill $CONTAINERS
   docker rm $CONTAINERS
fi

export DONT_START_WORKSPACE_HOST_IN_INIT=true
[[ $NODEMON == true ]] && HOST_NODE="/PrairieLearn/node_modules/.bin/nodemon -L" || HOST_NODE=node

cd /PrairieLearn
tmux "${args[@]}" new-session \; \
  send-keys "docker/init.sh" C-m \; \
  split-window -h -p 50 \; \
  send-keys "$HOST_NODE workspace_host/interface" C-m \; \
