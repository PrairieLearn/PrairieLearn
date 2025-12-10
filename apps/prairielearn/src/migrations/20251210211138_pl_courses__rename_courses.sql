-- This should be deployed during downtime.
ALTER TABLE pl_courses RENAME TO courses;

ALTER SEQUENCE pl_courses_id_seq RENAME TO courses_id_seq;

ALTER INDEX pl_courses_example_course_key RENAME TO courses_example_course_key;

ALTER TABLE courses RENAME CONSTRAINT pl_courses_pkey TO courses_pkey;
ALTER TABLE courses RENAME CONSTRAINT pl_courses_sharing_name_key TO courses_sharing_name_key;
ALTER TABLE courses RENAME CONSTRAINT pl_courses_sharing_token_key TO courses_sharing_token_key;
ALTER TABLE courses RENAME CONSTRAINT pl_courses_institution_id_fkey TO courses_institution_id_fkey;
ALTER TABLE courses RENAME CONSTRAINT pl_courses_sync_job_sequence_id_fkey TO courses_sync_job_sequence_id_fkey;
