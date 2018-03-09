#!/bin/bash

if [[ -z "$1" ]]; then
    ACTION=start
else
    ACTION=$1
fi

su postgres -c "/usr/pgsql-9.6/bin/pg_ctl -D /var/postgres -l /var/postgres/pg_log/logfile $ACTION"

if [[ "$ACTION" == "start" ]]; then
    # wait for postgres to start
    until /usr/pgsql-9.6/bin/pg_isready -q ; do sleep 1 ; done
fi
