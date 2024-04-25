ALTER TABLE errors
RENAME TO issues;

ALTER SEQUENCE errors_id_seq
RENAME TO issues_id_seq;

ALTER INDEX errors_pkey
RENAME TO issues_pkey;

ALTER INDEX errors_assessment_id_open_idx
RENAME TO issues_assessment_id_open_idx;

ALTER INDEX errors_authn_user_id_idx
RENAME TO issues_authn_user_id_idx;

ALTER INDEX errors_course_id_open_idx
RENAME TO issues_course_id_open_idx;

ALTER INDEX errors_course_instance_id_idx
RENAME TO issues_course_instance_id_idx;

ALTER INDEX errors_question_id_open_idx
RENAME TO issues_question_id_open_idx;

ALTER INDEX errors_user_id_idx
RENAME TO issues_user_id_idx;

ALTER INDEX errors_variant_id_idx
RENAME TO issues_variant_id_idx;

ALTER TABLE issues
RENAME CONSTRAINT errors_assessment_id_fkey TO issues_assessment_id_fkey;

ALTER TABLE issues
RENAME CONSTRAINT errors_authn_user_id_fkey TO issues_authn_user_id_fkey;

ALTER TABLE issues
RENAME CONSTRAINT errors_course_id_fkey TO issues_course_id_fkey;

ALTER TABLE issues
RENAME CONSTRAINT errors_course_instance_id_fkey TO issues_course_instance_id_fkey;

ALTER TABLE issues
RENAME CONSTRAINT errors_question_id_fkey TO issues_question_id_fkey;

ALTER TABLE issues
RENAME CONSTRAINT errors_user_id_fkey TO issues_user_id_fkey;

ALTER TABLE issues
RENAME CONSTRAINT errors_variant_id_fkey TO issues_variant_id_fkey;
