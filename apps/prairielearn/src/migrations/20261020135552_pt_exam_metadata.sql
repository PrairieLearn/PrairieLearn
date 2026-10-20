-- PrairieLearn tests do not run PrairieTest migrations; production shares the schema.
ALTER TABLE pt_courses
ADD COLUMN IF NOT EXISTS term text NOT NULL DEFAULT 'Unknown',
ADD COLUMN IF NOT EXISTS end_date timestamptz;

ALTER TABLE pt_centers
ADD COLUMN IF NOT EXISTS name text NOT NULL DEFAULT '',
ADD COLUMN IF NOT EXISTS term text NOT NULL DEFAULT 'Unknown',
ADD COLUMN IF NOT EXISTS end_date timestamptz;

CREATE TABLE IF NOT EXISTS pt_center_courses (
  id bigserial PRIMARY KEY,
  center_id bigint NOT NULL REFERENCES pt_centers ON UPDATE CASCADE ON DELETE CASCADE,
  course_id bigint NOT NULL REFERENCES pt_courses ON UPDATE CASCADE ON DELETE CASCADE,
  UNIQUE (center_id, course_id)
);

CREATE TABLE IF NOT EXISTS pt_center_exams (
  id bigserial PRIMARY KEY,
  center_course_id bigint NOT NULL REFERENCES pt_center_courses ON UPDATE CASCADE ON DELETE CASCADE,
  exam_id bigint NOT NULL REFERENCES pt_exams ON UPDATE CASCADE ON DELETE CASCADE,
  UNIQUE (center_course_id, exam_id)
);
