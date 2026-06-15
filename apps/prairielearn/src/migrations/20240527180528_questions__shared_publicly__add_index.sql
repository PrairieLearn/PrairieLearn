-- prairielearn:migrations NO TRANSACTION
CREATE INDEX CONCURRENTLY questions_course_id_shared_publicly_idx ON questions (course_id, shared_publicly);
