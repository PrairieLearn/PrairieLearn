#!/bin/bash

export PGDATA=${PGDATA:=/var/postgres}

if [[ -z "$1" ]]; then
    ACTION=start
else
    ACTION=$1
fi

# if we are trying to start but postgres is already running, exit with no action
if [[ "$ACTION" == "start" ]]; then
    if pg_isready -q; then
        echo "[start_postgres] Postgres is already running, skipping"
        exit
    fi
fi

mkdir -p $PGDATA
chown -f postgres:postgres $PGDATA
su postgres -c 'pg_ctl status' > /dev/null 2>&1
if [[ $? == 4 ]]; then
    echo "[start_postgres] Making new postgres database at ${PGDATA}"
    timeout 30 su postgres -c "initdb" > /dev/null 2>&1
    INIT_RESOLVE=0
    ACTION=start
fi

# Only locally start postgres if we weren't given a PGHOST environment variable
if [[ -z "$PGHOST" ]]; then
    echo "[start_postgres] Running pg_ctl ${ACTION}..."
    timeout 30 su postgres -c "pg_ctl --silent --log=${PGDATA}/postgresql.log ${ACTION}" || {
        echo "[start_postgres] ERROR: pg_ctl ${ACTION} timed out or failed"
        exit 1
    }
fi

if [[ "$ACTION" == "start" ]]; then
    # wait for postgres to start (local or PGHOST), timeout after 30 seconds
    echo "[start_postgres] Waiting for postgres to be ready..."
    SECONDS=0
    until pg_isready -q; do
        if [[ "$SECONDS" -ge 30 ]]; then
            echo "[start_postgres] ERROR: postgres did not start within 30 seconds"
            exit 1
        fi
        sleep 1
    done
    echo "[start_postgres] Postgres is ready (took ${SECONDS}s)"
fi

if [[ $INIT_RESOLVE ]]; then
    su postgres -c "createuser -s root"
fi
