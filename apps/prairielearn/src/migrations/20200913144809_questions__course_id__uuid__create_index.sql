CREATE UNIQUE INDEX IF NOT EXISTS questions_course_id_uuid_key ON questions (course_id, uuid);

DROP INDEX IF EXISTS questions_course_id_uuid_nondeleted_key;
