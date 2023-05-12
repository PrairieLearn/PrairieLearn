ALTER TABLE errors
ADD COLUMN open BOOLEAN DEFAULT TRUE;

DROP INDEX errors_course_id_idx;

CREATE INDEX errors_course_id_open_idx ON errors (course_id, course_caused, open);

DROP INDEX errors_assessment_id_idx;

CREATE INDEX errors_assessment_id_open_idx ON errors (assessment_id, course_caused, open);

DROP INDEX errors_question_id_idx;

CREATE INDEX errors_question_id_open_idx ON errors (course_id, course_caused, open);
