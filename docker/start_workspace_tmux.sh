#!/bin/bash

export PL_TMUX_SHOW_TIPS=1
export PL_TMUX_BOTTOM_PANE_PERCENT=40

pl_tmux_show_tips () {
  clear
  if [[ "${PL_TMUX_SHOW_TIPS:-0}" != "1" ]]; then
    return 0
  fi
  echo "PrairieLearn tmux session tips:"
  echo "- Use the mouse/trackpad to scroll, select, and resize panes."
  echo "- Mazimize/unmaximize a pane: Ctrl-B, release both keys, Z. Do not to press Ctrl-Z or you'll get a \"Stopped\" message. If that happens, enter command: fg"
  echo "- tmux mouse support interferes with your terminal's mouse selection, so to select text, maximize a pane first and then hold Shift (Win/Lin) or Fn (macOS) to select text normally."
  echo "- End the tmux session with: tmux kill-window (or you can Ctrl-C and \"exit\" each pane)"
}

# If you're using the terminal inside VS Code, you may also need this VS Code
# setting to be able to select text:
# "terminal.integrated.macOptionClickForcesSelection": true

TMUX_CONF=/PrairieLearn/.tmux.conf
[[ -f $TMUX_CONF ]] && args=(-f $TMUX_CONF) || args=()

pl_tmux_check_http () {
  curl -Is http://localhost:3000 >/dev/null 2>&1
}

pl_tmux_check_https () {
  curl -Isk https://localhost:3000 >/dev/null 2>&1
}

pl_tmux_check_lin_host () {
  if grep -iqe 'linux' <(uname -a) && ! grep -iqe '172.17.0.1' /etc/hosts ; then
    local OS_FLAG=$(docker info --format "{{.OperatingSystem}}" 2>/dev/null)
    [[ $? -eq 0 ]] || return
    OS_FLAG="${OS_FLAG,,}"
    if [[ "$OS_FLAG" == *linux* ]] || [[ "$OS_FLAG" != *mac* ]]; then
      echo "WARNING:"
      echo "It appears you're running Linux but you forgot to use this flag on Docker:"
      echo "--add-host=host.docker.internal:172.17.0.1"
      echo "Workspaces may fail to launch!"
      echo
    fi
  fi
}

pl_tmux_wait_alive () {
  while true; do
    pl_tmux_check_http && sleep 1s && return 0
    pl_tmux_check_https && sleep 1s && return 0
    sleep 1s
  done
}

pl_tmux_start_server_pane () {
  clear
  echo "Starting..."
  make start
}

pl_tmux_start_workspace_pane () {
  clear
  pl_tmux_check_lin_host
  echo "Waiting for server..."
  pl_tmux_wait_alive
  echo "Starting workspace host..."
  # A background process spams this pane, so pipe it to cat
  # to prevent a shell prompt from appearing also:
  make start-workspace-host | cat
}

export -f pl_tmux_check_http pl_tmux_check_https pl_tmux_check_lin_host pl_tmux_wait_alive pl_tmux_start_server_pane pl_tmux_start_workspace_pane pl_tmux_show_tips

# kill any containers with a name like workspace-*
CONTAINERS=$(docker ps -aq --filter "name=workspace-")
if [[ ! -z "$CONTAINERS" ]] ; then
  echo Killing existing workspace containers: $CONTAINERS
  docker kill $CONTAINERS
  docker rm $CONTAINERS
fi

cd /PrairieLearn

# Check if tmux is an old or new version.
if [[ "$(tmux -V)" =~ [0-9][^[:space:]]* ]]; then
  TMUX_VERSION=${BASH_REMATCH[0]}
fi

BOTTOM_PANE_DEFAULT=40
if [[ "$(printf "2.1\n${TMUX_VERSION:-1.8}\n" | sort -V | head -n 1)" == "2.1" ]]; then
  # tmux version >= 2.1
  tmux "${args[@]}" new-session \; \
    set -g mouse on \; \
    split-window -v -p "${PL_TMUX_BOTTOM_PANE_PERCENT:-$BOTTOM_PANE_DEFAULT}" \; \
    select-pane -l \; \
    send-keys "pl_tmux_start_server_pane" C-m \; \
    split-window -h -p 50 \; \
    send-keys "pl_tmux_start_workspace_pane" C-m \; \
    select-pane -t 2 \; \
    send-keys "pl_tmux_show_tips" C-m
else
  # tmux version < 2.1
  tmux "${args[@]}" new-session \; \
    set -g mode-mouse on \; \
    set -g mouse-select-pane on \; \
    set -g mouse-resize-pane on \; \
    set -g mouse-select-window on \; \
    split-window -v -p "${PL_TMUX_BOTTOM_PANE_PERCENT:-$BOTTOM_PANE_DEFAULT}" \; \
    select-pane -l \; \
    send-keys "pl_tmux_start_server_pane" C-m \; \
    split-window -h -p 50 \; \
    send-keys "pl_tmux_start_workspace_pane" C-m \; \
    select-pane -t 2 \; \
    send-keys "pl_tmux_show_tips" C-m
fi
