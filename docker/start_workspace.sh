#!/bin/bash

TMUX_CONF=/PrairieLearn/.tmux.conf
[[ -f $TMUX_CONF ]] && args=(-f $TMUX_CONF) || args=()

cd /PrairieLearn
tmux "${args[@]}" new-session \; \
  send-keys 'node workspace_host/interface' C-m \; \
  split-window -h -p 50 \; \
  send-keys 'docker/init.sh' C-m \; \
