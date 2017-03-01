#!/bin/bash

su postgres -c '/usr/pgsql-9.6/bin/pg_ctl -D /var/postgres -l /var/postgres/pg_log/logfile start'

# wait for postgres to start
until /usr/pgsql-9.6/bin/pg_isready -q ; do sleep 1 ; done

cd /PrairieLearn
node server.js
