#!/bin/bash
set -euo pipefail

fail() {
  echo "setup-devuser: $*" >&2
  exit 1
}

uid=${1:-1000}
[[ $uid =~ ^[1-9][0-9]*$ ]] || fail "Expected a positive numeric UID, got '$uid'."
[[ $EUID -eq 0 ]] || fail "Run this script as root inside the development container."
[[ -S /var/run/docker.sock ]] || fail "Mount the Docker socket at /var/run/docker.sock."

# Reuse groups by GID, since mounted files and sockets carry numeric ownership.
ensure_group() {
  local gid=$1 name=$2
  if ! getent group "$gid" >/dev/null; then
    if getent group "$name" >/dev/null; then
      fail "Group '$name' already exists with a different GID; need GID $gid."
    fi
    groupadd -g "$gid" "$name"
  fi
}

echo "Setting up devuser ($uid)"
if id devuser >/dev/null 2>&1; then
  actual_uid=$(id -u devuser)
  [[ $actual_uid == "$uid" ]] || fail "devuser has UID $actual_uid, but PL_USER requests $uid."
else
  if getent passwd "$uid" >/dev/null; then
    fail "UID $uid is already assigned to another user. Choose a different PL_USER."
  fi
  ensure_group "$uid" devuser
  useradd -u "$uid" -g "$uid" -m devuser
fi

home=$(getent passwd devuser | cut -d: -f6)
[[ $home == /* && $home != / ]] || fail "devuser must have an absolute home directory other than /."
install -d -o devuser -g "$(id -gn devuser)" -m 0755 \
  "$home" "$home/.cache" "$home/.cache/fontconfig"

docker_gid=$(stat -c '%g' /var/run/docker.sock)
ensure_group "$docker_gid" devuser-docker
if ! id -G devuser | tr ' ' '\n' | grep -qx "$docker_gid"; then
  usermod -aG "$docker_gid" devuser
fi
