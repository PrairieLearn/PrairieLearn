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

echo "Dumping ${COURSE_SHORT_NAME} ${COURSE_INSTANCE_SHORT_NAME} into ${OUTPUT_DUMP} and ${OUTPUT_JSON_DIR}"

TEMPLATE_DB=proddb  # database to copy (will not be changed)
TMP_DB=filterdb     # temporary working database (will be destroyed)

echo "Reading data from DB ${TEMPLATE_DB} and using temporary DB ${TMP_DB}"

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
echo "Output table list: ${OUTPUT_TABLE_LIST}"

set -v -e

dropdb ${TMP_DB} || true # don't stop on error
createdb --template=${TEMPLATE_DB} ${TMP_DB}

# drop pg_stat_statements

# Dropping pg_stat_statements...
psql --dbname=${TMP_DB} --file=- <<EOF
drop extension pg_stat_statements;
\gexec
EOF

# drop all unnecessary tables

# Dropping all tables not in output table list...
psql --dbname=${TMP_DB} --file=- <<EOF
select format('drop table %I cascade', tablename)
from pg_catalog.pg_tables
where schemaname = 'public'
and tablename not in (${OUTPUT_TABLE_LIST});
\gexec
EOF

# drop all views

# Dropping all views...
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

# Saving required assessment_instances to ai_tmp...
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

# Saving required instance_questions to iq_tmp...
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

# Saving required variants to v_tmp...
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

# Saving required submissions to s_tmp...
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

# Deleting all submissions, variants, instance_questions, and assessment_instances...
psql --dbname=${TMP_DB} --command="TRUNCATE submissions, variants, instance_questions, assessment_instances;"

# do the actual filtering

# Deleting all courses except the one we want...
psql --dbname=${TMP_DB} --command="DELETE FROM pl_courses WHERE short_name != '${COURSE_SHORT_NAME}';"
# Deleting all courses_instances except the one we want...
psql --dbname=${TMP_DB} --command="DELETE FROM course_instances WHERE short_name != '${COURSE_INSTANCE_SHORT_NAME}';"
# Deleting all users except ones used by other retained tables...
psql --dbname=${TMP_DB} --file=- <<EOF
delete from users
where user_id not in (
    select distinct user_id
    from (
        (select user_id from enrollments)
        union
        (select user_id from ai_tmp)
        union
        (select auth_user_id as user_id from ai_tmp)
        union
        (select authn_user_id as user_id from iq_tmp)
        union
        (select user_id from v_tmp)
        union
        (select authn_user_id as user_id from v_tmp)
        union
        (select auth_user_id as user_id from s_tmp)
    ) as tmp_user_ids
)
EOF

# copy back the saved data

# Copying back saved data for assessment_instances, instance_questions, variants, and submissions...
psql --dbname=${TMP_DB} --command="insert into assessment_instances select * from ai_tmp;"
psql --dbname=${TMP_DB} --command="insert into instance_questions select * from iq_tmp;"
psql --dbname=${TMP_DB} --command="insert into variants select * from v_tmp;"
psql --dbname=${TMP_DB} --command="insert into submissions select * from s_tmp;"

# drop the temporary tables used for saving

# Dropping the temporary tables ai_tmp, iq_tmp, v_tmp, and s_tmp...
psql --dbname=${TMP_DB} --command="drop table ai_tmp, iq_tmp, v_tmp, s_tmp;"

# anonymize

# Anonymizing data...

psql --dbname=${TMP_DB} --command="UPDATE users AS u SET uid = 'user' || u.user_id || '@example.com', name = 'User Name';"

psql --dbname=${TMP_DB} --command="UPDATE users AS u SET uin = NULL;"

psql --dbname=${TMP_DB} --command="update course_instance_access_rules as ar \
set uids = (select array_agg('user' || u.user_id || '@example.com') \
from unnest(ar.uids) as tmp (tmp_uid) join users as u on (u.uid = tmp_uid));"

psql --dbname=${TMP_DB} --command="update assessment_access_rules as ar \
set uids = (select array_agg('user' || u.user_id || '@example.com') \
from unnest(ar.uids) as tmp (tmp_uid) join users as u on (u.uid = tmp_uid));"

# dump everything that's left

# Dumping data to ${OUTPUT_DUMP}...
pg_dump -Fc --file="${OUTPUT_DUMP}" ${TMP_DB}

# output all tables as JSON

# Writing JSON data to ${OUTPUT_JSON_DIR}...
mkdir -p "${OUTPUT_JSON_DIR}"
for table in ${CLEAN_OUTPUT_TABLE_LIST} ; do
    psql --no-align --tuples-only --dbname=${TMP_DB} --file=- <<EOF
select json_agg(t) from ${table} as t
\g ${OUTPUT_JSON_DIR}/${table}.json
EOF
    gzip ${OUTPUT_JSON_DIR}/${table}.json
done
