#!/bin/bash

if [[ -z "$1" ]]; then
    ACTION=start
else
    ACTION=$1
fi

# Only locally start postgres if we weren't given a PG_HOST environment variable
if [[ -z "$PG_HOST" ]]; then
  su postgres -c "/usr/pgsql-11/bin/pg_ctl -D /var/postgres -l /var/postgres/pg_log/logfile $ACTION"
fi

if [[ "$ACTION" == "start" ]]; then
    # wait for postgres to start (local or PG_HOST)
    until /usr/pgsql-11/bin/pg_isready -q ; do sleep 1 ; done
fi
