CREATE TABLE IF NOT EXISTS
  sharing_sets (
    id BIGSERIAL PRIMARY KEY,
    course_id BIGINT NOT NULL REFERENCES pl_courses ON DELETE CASCADE ON UPDATE CASCADE,
    name text NOT NULL,
    UNIQUE (course_id, name)
  );

CREATE TABLE IF NOT EXISTS
  sharing_set_questions (
    id BIGSERIAL PRIMARY KEY,
    sharing_set_id BIGINT NOT NULL REFERENCES sharing_sets ON UPDATE CASCADE ON DELETE CASCADE,
    question_id BIGINT NOT NULL REFERENCES questions ON UPDATE CASCADE ON DELETE CASCADE,
    UNIQUE (sharing_set_id, question_id)
  );

CREATE TABLE IF NOT EXISTS
  sharing_set_courses (
    id BIGSERIAL PRIMARY KEY,
    sharing_set_id BIGINT NOT NULL REFERENCES sharing_sets ON DELETE CASCADE ON UPDATE CASCADE,
    course_id BIGINT NOT NULL REFERENCES pl_courses ON DELETE CASCADE ON UPDATE CASCADE,
    UNIQUE (sharing_set_id, course_id)
  );

ALTER TABLE pl_courses
ADD COLUMN IF NOT EXISTS sharing_name text UNIQUE;

ALTER TABLE pl_courses
ADD COLUMN IF NOT EXISTS sharing_token text UNIQUE;

ALTER TABLE pl_courses
ADD COLUMN IF NOT EXISTS question_sharing_enabled boolean default false;
