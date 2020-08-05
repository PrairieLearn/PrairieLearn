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

cd /PrairieLearn
tmux "${args[@]}" new-session \; \
  send-keys "docker/start_redis.sh ; docker/init.sh" C-m \; \
  split-window -h -p 50 \; \
  send-keys "sleep 5 ; node workspace_host/interface" C-m \; \
