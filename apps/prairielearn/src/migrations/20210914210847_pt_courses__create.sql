CREATE TABLE IF NOT EXISTS pt_courses (id bigserial PRIMARY KEY, name TEXT);

ALTER TABLE IF EXISTS pt_exams
ADD COLUMN IF NOT EXISTS name TEXT;

ALTER TABLE IF EXISTS pt_exams
ADD COLUMN IF NOT EXISTS course_id BIGINT REFERENCES pt_courses;
