#!/bin/bash

set -ex

# This script requires root.
[ "$(id -u)" -eq 0 ] || exit 1

mkdir -p /pgdata /var/run/postgresql
chown -R postgres:postgres /pgdata /var/run/postgresql
su postgres /pg-init.sh

# Delete install scripts; kept to allow for additional data installation
# rm /pg-init.sh
# rm /install-pg.sh
