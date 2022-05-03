#!/bin/bash

# Set a default for PGDATA if it's not already set
PGDATA=${PGDATA:=/var/postgres}

if [[ -z "$1" ]]; then
    ACTION=start
else
    ACTION=$1
fi

# if we are trying to start but postgres is already running, exit with no action
if [[ "$ACTION" == "start" ]]; then
    if pg_isready -q ; then
        exit
    fi
fi

# meet postgresql requirement that the folder must be owned by user postgres
if [[ "$ACTION" == "init" ]]; then
    chown -f postgres:postgres $PGDATA
fi

# Only locally start postgres if we weren't given a PG_HOST environment variable
if [[ -z "$PG_HOST" ]]; then
  su postgres -c "pg_ctl --silent --log=${PGDATA}/postgresql.log ${ACTION}"
fi

if [[ "$ACTION" == "start" ]]; then
    # wait for postgres to start (local or PG_HOST)
    until pg_isready -q ; do sleep 1 ; done
fi
