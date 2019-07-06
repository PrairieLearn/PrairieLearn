#!/bin/bash

if [ -z "$1" ]
then
   echo "Usage: $0 <dump-file>"
   exit
fi

INPUT_DUMP="$1"
DBNAME=proddb

set -x

dropdb ${DBNAME}
createdb ${DBNAME}
time pg_restore --dbname=${DBNAME} --jobs=4 --no-owner "${INPUT_DUMP}"
