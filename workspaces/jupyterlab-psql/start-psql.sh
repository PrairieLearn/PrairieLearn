#!/bin/bash

mkdir -p /tmp/data
/usr/lib/postgresql/14/bin/initdb -D /tmp/data
/usr/lib/postgresql/14/bin/postgres -D /tmp/data &
echo "Waiting for postgres..."
while ! pg_isready ; do sleep 1s ; done
/usr/lib/postgresql/14/bin/createuser --superuser postgres
/usr/lib/postgresql/14/bin/createdb world
psql world < /tmp/initdb/world.sql
psql world
