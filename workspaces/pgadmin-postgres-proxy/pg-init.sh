#!/bin/bash

set -ex

echo "Running $0 as: $(id)"

PG_USER="postgres"
PG_DB="postgres"

/usr/lib/postgresql/16/bin/initdb -D /pgdata
/usr/lib/postgresql/16/bin/pg_ctl -D /pgdata start
echo "Waiting for postgres to start..."
while ! pg_isready ; do sleep 1s ; done

psql -U "$PG_USER" -d "$PG_DB" -c "ALTER USER $PG_USER WITH PASSWORD 'postgres';"

find /sql-scripts -type f -name '*.sql' | while read -r sql_file; do
  psql -U "$PG_USER" -d "$PG_DB" -f "$sql_file"
done

find /sql-scripts -type f -name '*.dump' | while read -r dump_file; do
  pg_restore -U "$PG_USER" -d "$PG_DB" "$dump_file"
done

/usr/lib/postgresql/16/bin/pg_ctl -D /pgdata stop
echo "Waiting for postgres to stop..."
while pg_isready ; do sleep 1s ; done
