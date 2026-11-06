#!/bin/sh
# Prepares the workspace in one container exec. Usage: course-agent-setup fresh|restore|configure
#   fresh      new workspace: create directories and write the Codex config
#   restore    before restoring a checkpoint: report resources only
#   configure  after restoring a checkpoint: rewrite the Codex config
# CODEX_CONFIG holds the config.toml contents, which contain no credentials or repository data.
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
    printf '%s' "$CODEX_CONFIG" > "$session/home/.codex/config.toml"
    chown -R 1000:1000 "$session/home"
fi

echo "memTotalKb=$(awk '/^MemTotal:/ { print $2 }' /proc/meminfo)"
echo "cpus=$(nproc)"
echo "setupMs=$(($(date +%s%3N) - start))"
