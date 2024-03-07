CREATE TYPE enum_chunk_type AS ENUM(
  'elements',
  'clientFilesCourse',
  'serverFilesCourse',
  'clientFilesCourseInstance',
  'clientFilesAssessment',
  'question'
);

CREATE TABLE IF NOT EXISTS chunks (
  id BIGSERIAL PRIMARY KEY,
  uuid UUID NOT NULL UNIQUE,
  type enum_chunk_type NOT NULL,
  course_id BIGINT NOT NULL REFERENCES pl_courses (id) ON DELETE CASCADE ON UPDATE CASCADE,
  course_instance_id BIGINT REFERENCES course_instances (id) ON DELETE CASCADE ON UPDATE CASCADE,
  assessment_id BIGINT REFERENCES assessments (id) ON DELETE CASCADE ON UPDATE CASCADE,
  question_id BIGINT REFERENCES questions (id) ON DELETE CASCADE ON UPDATE CASCADE
);
