# Tables referenced by PrairieSchedule

To determine all tables referenced by PrairieSchedule, I used a couple of commands. The commands and their output are reproduced below.

**All tables referenced by JOINS**

```sh
grep -r "JOIN" . | sed -nE 's/.*JOIN ([a-zA-Z_]+) .*/\1/p' | sort | uniq
```

```
a
accommodations
active_cis
add_dates
allowed
assessment_access_rules
assessment_questions
assessments
cbtf_exams
checked_in_this_semester
course_instance_access_rules
course_instances
courses
declines
dres
exam_alternates
exam_overrides
exam_protocols
exam_time_exams
exam_time_tags
exam_times
exams
given_et
ics_user
locations
note_types
orig
our_courses
pick_exams
pl_courses
ps_audit_logs
ps_email_log
ps_icalendar
ps_inout
questions
registrations
reservation_authz
reservation_exam_times
reservation_tags
reservations
roles
select_conflict_start_times
select_courses
select_enrolled
select_exam_times_linked
select_exams
select_reservation_auth
select_reservations
semesters
stu_res
stu_rescount
tmp_exams
user_history
users
users_soon
users_tomorrow
variants
```

**All tables references by FROMs**

```sh
pcregrep -r -M -o1 -h '(?:FROM\n?\s+)([A-Za-z0-9_]+)' . | sort | uniq
```

```
a
accommodations
aliases
all_ets
assessments
available
broken_machines
changes
conflict
conflicts
course_aliases
course_instances
courses
declines
dres
est_update
et
exam_alternates
exam_days
exam_overrides
exam_protocols
exam_time_exams
exam_time_tags
exam_times
exams
finals_times
information_schema
insert_conflict_times
insert_course
insert_evening
insert_exam
insert_finals_times
insert_morning
insert_normal_links
insert_role
insert_time
instance_questions
issues
json_reservations
json_user
locations
make_reservation
matching_exam_times
morning_times
normal
note_types
notes
old_zoom
output_exam_times
pairs
pg_proc
pg_type
ps2_exams
ps2_examtimes
ps2_users
ps_audit_logs
ps_audit_select_with_filter
ps_icalendar
ps_inout
ps_strikes
query_results
raw_select_reservations_by_day
recent_exam_times
registrations
regs
remove_reservations
removes
res_hour
reservation_authz
reservation_exam_times
reservation_tags
reservations
reservations_this_hour
roles
select_active
select_conflict
select_conflict_requests_pending
select_course
select_courses
select_ep
select_exam
select_exam_times
select_exams
select_options
select_registrations
select_reservations
select_reservations_today
select_roles
select_seen
select_times
select_user
semesters
start_time
stdin
stu_exams
subq
tmp_exams
unnest
update_exam_times
update_exams
users
users_soon
users_tomorrow
```

**All tables created by PrairieSchedule migrations**

```sh
grep -rh "CREATE TABLE" migrations | sed -nE 's/.*IF NOT EXISTS ([A-Za-z_]+).*/\1/p' | sort | uniq
```

```
accommodations
broken_machines
course_aliases
courses
declines
dres
exam_alternates
exam_overrides
exam_protocols
exam_time_exams
exam_time_tags
exam_times
exams
locations
note_types
notes
pl_courses
ps_audit_logs
ps_email_log
ps_icalendar
ps_inout
ps_strikes
registrations
reservation_authz
reservation_exam_times
reservation_tags
reservations
roles
semesters
users
```

**All tables created by PrairieLearn migrations**

```sh
grep -rh "CREATE TABLE" migrations | sed -nE 's/.* ([a-z_]+) \(/\1/p' | sort | uniq | wc -l
```

```
access_logs
access_tokens
administrators
alternative_groups
assessment_access_rules
assessment_instances
assessment_questions
assessment_score_logs
assessment_sets
assessment_state_logs
assessments
audit_logs
authn_providers
chunks
config
course_instance_access_rules
course_instance_permissions
course_instances
course_permissions
course_requests
courses
cron_jobs
current_pages
enrollments
exam_mode_networks
exams
file_edits
file_transfers
files
grader_loads
grading_jobs
group_configs
group_logs
group_users
groups
instance_questions
institution_authn_providers
institutions
issues
job_sequences
jobs
last_accesses
lti_credentials
lti_links
lti_outcomes
named_locks
news_item_notifications
news_items
page_view_logs
pl_courses
query_runs
question_score_logs
question_tags
questions
reservations
server_loads
submissions
tags
time_series
topics
users
variant_view_logs
variants
workspace_hosts
workspace_logs
workspaces
zones
```

Notes that `errors` was renamed to `issues` and `grading_logs` was renamed to `grading_jobs`. This is reflected above, but was manually edited from the raw output.

**All tables created by either PrairieLearn or PrairieSchedule**

```sh
cat rfcs/ps_tables.txt rfcs/pl_tables.txt | sort | uniq
```

```
access_logs
access_tokens
accommodations
administrators
alternative_groups
assessment_access_rules
assessment_instances
assessment_questions
assessment_score_logs
assessment_sets
assessment_state_logs
assessments
audit_logs
authn_providers
broken_machines
chunks
config
course_aliases
course_instance_access_rules
course_instance_permissions
course_instances
course_permissions
course_requests
courses
cron_jobs
current_pages
declines
dres
enrollments
exam_alternates
exam_mode_networks
exam_overrides
exam_protocols
exam_time_exams
exam_time_tags
exam_times
exams
file_edits
file_transfers
files
grader_loads
grading_jobs
group_configs
group_logs
group_users
groups
instance_questions
institution_authn_providers
institutions
issues
job_sequences
jobs
last_accesses
locations
lti_credentials
lti_links
lti_outcomes
named_locks
news_item_notifications
news_items
note_types
notes
page_view_logs
pl_courses
ps_audit_logs
ps_email_log
ps_icalendar
ps_inout
ps_strikes
query_runs
question_score_logs
question_tags
questions
registrations
reservation_authz
reservation_exam_times
reservation_tags
reservations
roles
semesters
server_loads
submissions
tags
time_series
topics
users
variant_view_logs
variants
workspace_hosts
workspace_logs
workspaces
zones
```

**Tables accessed by PrairieSchedule that were created by either PrairieLearn or PrairieSchedule**

```sh
comm -12 rfcs/all_tables.txt rfcs/ps_references.txt > rfcs/ps_table_references.txt
```

```
accommodations
assessment_access_rules
assessment_questions
assessments
broken_machines
course_aliases
course_instance_access_rules
course_instances
courses
declines
dres
exam_alternates
exam_overrides
exam_protocols
exam_time_exams
exam_time_tags
exam_times
exams
instance_questions
issues
locations
note_types
notes
pl_courses
ps_audit_logs
ps_email_log
ps_icalendar
ps_inout
ps_strikes
questions
registrations
reservation_authz
reservation_exam_times
reservation_tags
reservations
roles
semesters
users
variants
```

**Tables references by PrairieScheduler that were created by PrairieLearn**

```sh
comm -12 rfcs/pl_tables.txt rfcs/ps_table_references.txt
```

```
assessment_access_rules
assessment_questions
assessments
course_instance_access_rules
course_instances
courses
exams
instance_questions
issues
pl_courses
questions
reservations
users
variants
```

## Individual table analysis

### `assessment_access_rules`

Used in `lib/plps-utilities.sql`.

### `assessment_questions`

Used only in PLPeek.

### `assessments`

Used in PLPeek and `lib/plps-utilities.sql`.

### `course_instance_access_rules`

Used in `lib/plps-utilities.sql`.

### `course_instances`

Used in PLPeek and `lib/plps-utilities.sql`.

### `courses`

Used in everything. This is a special one - PrairieLearn "creates" the same table, but only so that references to it don't fail locally. PrairieSchedule owns this table. All of PrairieLearn's course data is stored in the `pl_courses` table.

PrairieLearn references this table in two places:

- `pages/instructorAssessmentAccess/instructorAssessmentAccess.sql`
- `sprocs/check_assessment_access_rule.sql`
- `tests/testAccess.sql`

### `exams`

Used in everything. This is another special one that PrairieLearn "creates", but is really owned by PrairieSchedule.

- `tests/testAccess.sql`
- `sync/fromDisk/assessments.sql`
- `sprocs/check_assessment_access_rule.sql`
- `pages/instructorAssessmentAccess/instructorAssessmentAccess.sql`

### `instance_questions`

Used only in PLPeek.

### `issues`

Used only in PLPeek.

### `pl_courses`

Used only in PLPeek.


### `questions`

Used only in PLPeek.


### `reservations`

Owned by PrairieSchedule. Referenced by PrairieLearn in the following places:

- `sprocs/ip_to_mode.sql`
- `sprocs/check_assessment_access_rule.sql`

### `users`

This is a mess. Each service shares the entire table.

### `variants`

Used only in PLPeek.
