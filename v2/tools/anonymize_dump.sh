#!/bin/bash

if [ -z "$1" ]
then
   echo "Usage: $0 <dump-file>"
   exit
fi

INPUT_DUMP="$1"
OUTPUT_DUMP="${INPUT_DUMP}".anon

set -x

dropdb anondb
createdb anondb
pg_restore --dbname anondb "${INPUT_DUMP}"
psql --dbname anondb --command "UPDATE users AS u SET uid = 'user' || u.id || '@example.com', name = 'User Name';"
pg_dump --file "${OUTPUT_DUMP}" anondb
