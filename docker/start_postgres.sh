#!/bin/bash

export PGDATA=${PGDATA:=/var/postgres}

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

mkdir -p $PGDATA
chown -f postgres:postgres $PGDATA
su postgres -c 'pg_ctl status' >/dev/null 2>&1
if [[ $? == 4 ]]; then
    echo "Making new postgres database at ${PGDATA}"
    su postgres -c "initdb" >/dev/null 2>&1
    INIT_RESOLVE=0
    ACTION=start
fi

# Only locally start postgres if we weren't given a PGHOST environment variable
if [[ -z "$PGHOST" ]]; then
  su postgres -c "pg_ctl --silent --log=${PGDATA}/postgresql.log ${ACTION}"
fi

if [[ "$ACTION" == "start" ]]; then
    # wait for postgres to start (local or PGHOST)
    until pg_isready -q ; do sleep 1 ; done
fi

if [[ $INIT_RESOLVE ]]; then
    su postgres -c "createuser -s root"
fi
