#!/bin/bash

# These options affect the appearance of the tmux view.
export PL_TMUX_SHOW_TIPS=1
export PL_TMUX_BOTTOM_PANE_PERCENT=40

# If you're using the terminal inside VS Code, you may also need this VS Code
# setting to be able to select text:
# "terminal.integrated.macOptionClickForcesSelection": true

# These options can help if you are using this script as an entrypoint for the
# Docker version of PL:

# INVOKE_YARN: Yarn can be invoked to install npm packages upon load.
# Set to 1 to enable, 0 to disable.
INVOKE_YARN=1

# CHOWN_GENERATED_FILES: If you are running this script in a Linux container
# with /PrairieLearn mounted from a local path for development, we can change
# the ownership of generated files back to your normal user account when the
# session ends. This will be detected from the uid:gid set on the
# /PrairieLearn directory itself. You can disable this feature to avoid
# slowdowns at session exit, but that may leave node_modules owned by root in
# some cases.
# Set to 1 to enable, 0 to disable.
CHOWN_GENERATED_FILES=1

# If you want to kill lingering PrairieLearn workspace containers before or
# after the session, these options can be set to 1. This can help to avoid
# issues or save memory.
KILL_WORKSPACES_BEFORE=1
KILL_WORKSPACES_AFTER=1

# -------

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

TMUX_CONF=/PrairieLearn/.tmux.conf
[[ -f "$TMUX_CONF" ]] && args=(-f "$TMUX_CONF") || args=()

pl_tmux_check_http () {
  curl -Is http://localhost:3000 >/dev/null 2>&1
}

pl_tmux_check_https () {
  curl -Isk https://localhost:3000 >/dev/null 2>&1
}

pl_tmux_check_lin_host () {
  if grep -iqe 'linux' <(uname -a) && ! grep -iqe '172.17.0.1' /etc/hosts ; then
    local OS_FLAG
    OS_FLAG=$(docker info --format "{{.OperatingSystem}}" 2>/dev/null || echo "NO_DOCKER_INFO")
    if [[ "$OS_FLAG" == "NO_DOCKER_INFO" ]]; then
      echo "Could not get info about OS from Docker. (Maybe not running in Docker.)"
      return
    fi
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
  make dev
}

pl_tmux_start_workspace_pane () {
  clear
  pl_tmux_check_lin_host
  echo "Waiting for server..."
  pl_tmux_wait_alive
  echo "Starting workspace host..."
  # A background process spams this pane, so pipe it to cat
  # to prevent a shell prompt from appearing also:
  make dev-workspace-host | cat
}

export -f pl_tmux_check_http pl_tmux_check_https pl_tmux_check_lin_host pl_tmux_wait_alive pl_tmux_start_server_pane pl_tmux_start_workspace_pane pl_tmux_show_tips

if [ ${KILL_WORKSPACES_BEFORE:0} -eq 1 ]; then
  # kill any containers with a name like workspace-*
  CONTAINERS=$(docker ps -aq --filter "name=workspace-")
  if [[ ! -z "$CONTAINERS" ]] ; then
    echo "Killing existing workspace containers: $CONTAINERS"
    docker kill $CONTAINERS
    docker rm $CONTAINERS
  fi
fi

cd /PrairieLearn || {
  echo "WARNING: Could not cd into /PrairieLearn"
  echo "  Probably not running in Docker. We hope you know what you're doing."
}

if [ ${INVOKE_YARN:0} -eq 1 ]; then
  yarn config set --home enableTelemetry 0
  yarn || { echo "Yarn had an error. Giving up." ; exit 1 ; }
fi

# Check if tmux is an old or new version.
if [[ "$(tmux -V)" =~ [0-9][^[:space:]]* ]]; then
  TMUX_VERSION=${BASH_REMATCH[0]}
fi

BOTTOM_PANE_DEFAULT=40
if [[ "$(printf "2.1\n%s\n" "${TMUX_VERSION:-1.8}" | sort -V | head -n 1)" == "2.1" ]]; then
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

# We only intend to do this when running in the Docker with /PrairieLearn
# mounted from a local checkout.
if [[ "$OSTYPE" == *linux* && -w /PrairieLearn ]]; then
  PL_DIR_UID=$(stat -c '%u' /PrairieLearn)
  PL_DIR_GID=$(stat -c '%g' /PrairieLearn)
  if [ ${PL_DIR_UID:0} -gt 0 ] && [ ${CHOWN_GENERATED_FILES:0} -eq 1 ] ; then
    echo "Retaking ownership of files in /PrairieLearn to match local uid:gid ${PL_DIR_UID}:${PL_DIR_GID}..."
    chown -R "${PL_DIR_UID}:${PL_DIR_GID}" /PrairieLearn && echo "Done"
  fi
fi

if [ ${KILL_WORKSPACES_AFTER:0} -eq 1 ]; then
  # Kill any lingering workspaces to clean up.
  CONTAINERS=$(docker ps -aq --filter "name=workspace-")
  if [[ ! -z "$CONTAINERS" ]] ; then
    echo "Killing remaining workspace containers: $CONTAINERS"
    docker kill $CONTAINERS
    docker rm $CONTAINERS
  fi
fi
