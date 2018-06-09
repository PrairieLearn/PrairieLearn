#!/bin/bash

# this script relies on having a template copy of the full production
# database available first -- use the dump_restore.sh script

if [ -z "$1" ]
then
   echo "Usage: $0 <output-dump-prefix>"
   exit
fi

COURSE_SHORT_NAME="TAM 212"
COURSE_INSTANCE_SHORT_NAME="Sp18"

OUTPUT_DUMP="$1.dump"
OUTPUT_JSON_DIR="$1.tables"

TEMPLATE_DB=proddb  # database to copy (will not be changed)
TMP_DB=filterdb     # temporary working database (will be destroyed)

# list of tables to be included in the filtered output
OUTPUT_TABLE_LIST="\
          'pl_courses', \
          'users', \
          'course_permissions', \
          'administrators', \
          'course_instances', \
          'course_instance_access_rules', \
          'assessment_sets', \
          'assessments', \
          'assessment_access_rules', \
          'topics', \
          'questions', \
          'tags', \
          'question_tags', \
          'zones', \
          'alternative_groups', \
          'assessment_questions', \
          'enrollments', \
          'assessment_instances', \
          'instance_questions', \
          'variants', \
          'submissions' \
"
CLEAN_OUTPUT_TABLE_LIST=$(echo "${OUTPUT_TABLE_LIST}" | tr "'," "  ")

set -x -e

dropdb ${TMP_DB} || true # don't stop on error
createdb --template=${TEMPLATE_DB} ${TMP_DB}

# drop all unnecessary tables

psql --dbname=${TMP_DB} --file=- <<EOF
select format('drop table %I cascade', tablename)
from pg_catalog.pg_tables
where schemaname = 'public'
and tablename not in (${OUTPUT_TABLE_LIST});
\gexec
EOF

# drop all views

psql --dbname=${TMP_DB} --file=- <<EOF
select format('drop view %I cascade', viewname)
from pg_catalog.pg_views
where schemaname = 'public'
\gexec
EOF

# Copy out the data we care about from large tables. This is needed to
# speed up the later DELETE commands. It's fine to leave the small
# tables in place and let them be cleaned up by the automatic CASCADE
# on the foreign key constraints.

psql --dbname=${TMP_DB} --file=- <<EOF
create table ai_tmp as
select ai.*
from assessment_instances as ai
join assessments as a on (a.id = ai.assessment_id)
join course_instances as ci on (ci.id = a.course_instance_id)
join pl_courses as c on (c.id = ci.course_id)
join enrollments as e on (e.user_id = ai.user_id and e.course_instance_id = ci.id)
where c.short_name = '${COURSE_SHORT_NAME}'
and ci.short_name = '${COURSE_INSTANCE_SHORT_NAME}';
EOF

psql --dbname=${TMP_DB} --file=- <<EOF
create table iq_tmp as
select iq.*
from instance_questions as iq
join assessment_instances as ai on (ai.id = iq.assessment_instance_id)
join assessments as a on (a.id = ai.assessment_id)
join course_instances as ci on (ci.id = a.course_instance_id)
join pl_courses as c on (c.id = ci.course_id)
join enrollments as e on (e.user_id = ai.user_id and e.course_instance_id = ci.id)
where c.short_name = '${COURSE_SHORT_NAME}'
and ci.short_name = '${COURSE_INSTANCE_SHORT_NAME}';
EOF

psql --dbname=${TMP_DB} --file=- <<EOF
create table v_tmp as
select v.*
from variants as v
join instance_questions as iq on (iq.id = v.instance_question_id)
join assessment_instances as ai on (ai.id = iq.assessment_instance_id)
join assessments as a on (a.id = ai.assessment_id)
join course_instances as ci on (ci.id = a.course_instance_id)
join pl_courses as c on (c.id = ci.course_id)
join enrollments as e on (e.user_id = ai.user_id and e.course_instance_id = ci.id)
where c.short_name = '${COURSE_SHORT_NAME}'
and ci.short_name = '${COURSE_INSTANCE_SHORT_NAME}';
EOF

psql --dbname=${TMP_DB} --file=- <<EOF
create table s_tmp as
select s.*
from submissions as s
join variants as v on (v.id = s.variant_id)
join instance_questions as iq on (iq.id = v.instance_question_id)
join assessment_instances as ai on (ai.id = iq.assessment_instance_id)
join assessments as a on (a.id = ai.assessment_id)
join course_instances as ci on (ci.id = a.course_instance_id)
join pl_courses as c on (c.id = ci.course_id)
join enrollments as e on (e.user_id = ai.user_id and e.course_instance_id = ci.id)
where c.short_name = '${COURSE_SHORT_NAME}'
and ci.short_name = '${COURSE_INSTANCE_SHORT_NAME}';
EOF

# delete all the data from the tables that we copied

psql --dbname=${TMP_DB} --command="TRUNCATE submissions, variants, instance_questions, assessment_instances;"

# do the actual filtering

psql --dbname=${TMP_DB} --command="DELETE FROM pl_courses WHERE short_name != '${COURSE_SHORT_NAME}';"
psql --dbname=${TMP_DB} --command="DELETE FROM course_instances WHERE short_name != '${COURSE_INSTANCE_SHORT_NAME}';"
psql --dbname=${TMP_DB} --command="delete from users where user_id not in (select user_id from enrollments);"

# copy back the saved data

psql --dbname=${TMP_DB} --command="insert into assessment_instances select * from ai_tmp;"
psql --dbname=${TMP_DB} --command="insert into instance_questions select * from iq_tmp;"
psql --dbname=${TMP_DB} --command="insert into variants select * from v_tmp;"
psql --dbname=${TMP_DB} --command="insert into submissions select * from s_tmp;"

# drop the temporary tables used for saving

psql --dbname=${TMP_DB} --command="drop table ai_tmp, iq_tmp, v_tmp, s_tmp;"

# anonymize

psql --dbname=${TMP_DB} --command="UPDATE users AS u SET uid = 'user' || u.user_id || '@example.com', name = 'User Name';"

psql --dbname=${TMP_DB} --command="UPDATE users AS u SET uin = NULL;"

psql --dbname=${TMP_DB} --command="update course_instance_access_rules as ar \
set uids = (select array_agg('user' || u.user_id || '@example.com') \
from unnest(ar.uids) as tmp (tmp_uid) join users as u on (u.uid = tmp_uid));"

psql --dbname=${TMP_DB} --command="update assessment_access_rules as ar \
set uids = (select array_agg('user' || u.user_id || '@example.com') \
from unnest(ar.uids) as tmp (tmp_uid) join users as u on (u.uid = tmp_uid));"

# dump everything that's left

pg_dump -Fc --file="${OUTPUT_DUMP}" ${TMP_DB}

# output all tables as JSON

mkdir -p "${OUTPUT_JSON_DIR}"
for table in ${CLEAN_OUTPUT_TABLE_LIST} ; do
    psql --no-align --tuples-only --dbname=${TMP_DB} --file=- <<EOF
select json_agg(t) from ${table} as t
\g ${OUTPUT_JSON_DIR}/${table}.json
EOF
    gzip ${OUTPUT_JSON_DIR}/${table}.json
done
