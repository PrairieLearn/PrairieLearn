ALTER TABLE pl_courses
ADD COLUMN sync_job_sequence_id bigint REFERENCES job_sequences ON UPDATE CASCADE ON DELETE SET NULL,
ADD COLUMN sync_errors TEXT,
ADD COLUMN sync_warnings TEXT;

ALTER TABLE questions
ADD COLUMN sync_job_sequence_id bigint REFERENCES job_sequences ON UPDATE CASCADE ON DELETE SET NULL,
ADD COLUMN sync_errors TEXT,
ADD COLUMN sync_warnings TEXT,
ALTER COLUMN uuid
DROP NOT NULL;

CREATE UNIQUE INDEX questions_course_id_uuid_nondeleted_key ON questions (course_id, uuid)
WHERE
  deleted_at IS NULL;

ALTER TABLE questions
DROP CONSTRAINT questions_course_id_uuid_key;

CREATE UNIQUE INDEX questions_course_id_number_nondeleted_key ON questions (course_id, uuid)
WHERE
  deleted_at IS NULL;

ALTER TABLE questions
DROP CONSTRAINT questions_course_id_number_key;

ALTER TABLE course_instances
ADD COLUMN sync_job_sequence_id bigint REFERENCES job_sequences ON UPDATE CASCADE ON DELETE SET NULL,
ADD COLUMN sync_errors TEXT,
ADD COLUMN sync_warnings TEXT,
ALTER COLUMN uuid
DROP NOT NULL;

ALTER TABLE assessments
ADD COLUMN sync_job_sequence_id bigint REFERENCES job_sequences ON UPDATE CASCADE ON DELETE SET NULL,
ADD COLUMN sync_errors TEXT,
ADD COLUMN sync_warnings TEXT,
ALTER COLUMN uuid
DROP NOT NULL;
