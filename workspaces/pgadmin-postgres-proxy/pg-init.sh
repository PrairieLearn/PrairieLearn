#!/bin/bash

set -ex

echo "Running $0 as: $(id)"

/usr/lib/postgresql/14/bin/initdb -D /pgdata
/usr/lib/postgresql/14/bin/pg_ctl -D /pgdata start
echo "Waiting for postgres to start..."
while ! pg_isready ; do sleep 1s ; done
# /usr/lib/postgresql/14/bin/createuser --superuser postgres # already exists
# /usr/lib/postgresql/14/bin/createdb postgres # already exists
psql -U postgres -d postgres -c "ALTER USER postgres WITH PASSWORD 'postgres';"
psql -U postgres -d postgres < /sql-scripts/imdb.sql
psql -U postgres -d postgres < /sql-scripts/world.sql
psql -U postgres -d postgres < /sql-scripts/mds.sql
/usr/lib/postgresql/14/bin/pg_ctl -D /pgdata stop
echo "Waiting for postgres to stop..."
while pg_isready ; do sleep 1s ; done
