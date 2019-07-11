#!/bin/bash

# this script relies on having a template copy of the full production
# database available first -- use the dump_restore.sh script

if [ -z "$1" ]
then
   echo "Usage: $0 <output-dump-file>"
   exit
fi

OUTPUT_DUMP="$1"
TEMPLATE_DB=proddb
TMP_DB=anondb

set -x -e

dropdb ${TMP_DB}
createdb --template=${TEMPLATE_DB} ${TMP_DB}

# anonymize

psql --dbname=${TMP_DB} --command="UPDATE users AS u SET uid = 'user' || u.user_id || '@example.com', name = 'User Name';"

psql --dbname=${TMP_DB} --command="UPDATE users AS u SET uin = NULL;"

psql --dbname=${TMP_DB} --command="update course_instance_access_rules as ar \
set uids = (select array_agg('user' || u.user_id || '@example.com') \
from unnest(ar.uids) as tmp (tmp_uid) join users as u on (u.uid = tmp_uid));"

psql --dbname=${TMP_DB} --command="update assessment_access_rules as ar \
set uids = (select array_agg('user' || u.user_id || '@example.com') \
from unnest(ar.uids) as tmp (tmp_uid) join users as u on (u.uid = tmp_uid));"

# dump the DB

pg_dump -Fc --file="${OUTPUT_DUMP}" ${TMP_DB}
