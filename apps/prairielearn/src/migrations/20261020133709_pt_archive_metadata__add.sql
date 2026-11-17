-- PrairieLearn tests do not run PrairieTest migrations; production shares the schema.
ALTER TABLE pt_courses
ADD COLUMN IF NOT EXISTS end_date timestamptz,
ADD COLUMN IF NOT EXISTS term text NOT NULL DEFAULT 'Unknown';

ALTER TABLE pt_centers
ADD COLUMN IF NOT EXISTS end_date timestamptz,
ADD COLUMN IF NOT EXISTS name text NOT NULL DEFAULT '',
ADD COLUMN IF NOT EXISTS term text NOT NULL DEFAULT 'Unknown';

CREATE TABLE IF NOT EXISTS pt_center_courses (
  id bigserial PRIMARY KEY,
  center_id bigint NOT NULL REFERENCES pt_centers (id) ON UPDATE CASCADE ON DELETE CASCADE,
  course_id bigint NOT NULL REFERENCES pt_courses (id) ON UPDATE CASCADE ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS pt_center_exams (
  id bigserial PRIMARY KEY,
  center_course_id bigint NOT NULL REFERENCES pt_center_courses (id) ON UPDATE CASCADE ON DELETE CASCADE,
  exam_id bigint NOT NULL REFERENCES pt_exams (id) ON UPDATE CASCADE ON DELETE CASCADE
);
