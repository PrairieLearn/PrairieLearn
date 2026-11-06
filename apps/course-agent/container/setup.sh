#!/bin/sh
# Prepares the workspace in one container exec. Usage: course-agent-setup fresh|restore|configure
#   fresh      new workspace: create directories and install the Codex config
#   restore    before restoring a checkpoint: report resources only
#   configure  after restoring a checkpoint: reinstall the Codex config, which may have changed
set -eu
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
start=$(date +%s%3N)
session=/workspace/session

case "$1" in
    fresh)
        mkdir -p "$session/home/.codex"
        chown -R 1000:1000 "$session"
        ;;
    restore | configure) ;;
    *)
        echo "Unknown mode: $1" >&2
        exit 2
        ;;
esac

if [ "$1" != restore ]; then
    install -o 1000 -g 1000 -m 644 /etc/course-agent/codex-config.toml "$session/home/.codex/config.toml"
fi

echo "memTotalKb=$(awk '/^MemTotal:/ { print $2 }' /proc/meminfo)"
echo "cpus=$(nproc)"
echo "setupMs=$(($(date +%s%3N) - start))"
