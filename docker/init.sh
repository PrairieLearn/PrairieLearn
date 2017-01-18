#!/bin/bash

su postgres -c '/usr/pgsql-9.6/bin/pg_ctl -D /var/postgres -l /var/postgres/pg_log/logfile start'

cd /PrairieLearn
node server.js
