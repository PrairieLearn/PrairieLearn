#!/bin/bash
set -e

PG_BIN="/usr/lib/postgresql/17/bin"

export PGDATA=${PGDATA:=/var/postgres}
export PATH="${PG_BIN}:$PATH"

if [[ -z "$1" ]]; then
    ACTION=start
else
    ACTION=$1
fi

# if we are trying to start but postgres is already running, exit with no action
if [[ "$ACTION" == "start" ]]; then
    if pg_isready -q; then
        exit
    fi
fi

mkdir -p $PGDATA
chown -f postgres:postgres $PGDATA
pg_status=0
su postgres -c "${PG_BIN}/pg_ctl status" > /dev/null 2>&1 || pg_status=$?
if [[ $pg_status == 4 ]]; then
    echo "Making new postgres database at ${PGDATA}"
    su postgres -c "${PG_BIN}/initdb"
    INIT_RESOLVE=true
    ACTION=start
fi

# Only locally start postgres if we weren't given a PGHOST environment variable
if [[ -z "$PGHOST" ]]; then
    su postgres -c "${PG_BIN}/pg_ctl --silent --log=${PGDATA}/postgresql.log ${ACTION}"
fi

if [[ "$ACTION" == "start" ]]; then
    # wait for postgres to start (local or PGHOST)
    until pg_isready -q; do sleep 1; done
fi

if [[ "${INIT_RESOLVE:-}" == "true" ]]; then
    su postgres -c "${PG_BIN}/createuser -s root"
fi
