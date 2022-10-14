CREATE TABLE IF NOT EXISTS sharing_sets (
    id BIGSERIAL PRIMARY KEY,
    course_id BIGINT NOT NULL REFERENCES pl_courses ON DELETE CASCADE ON UPDATE CASCADE,
    description text,
    name text,
    number INTEGER
);

CREATE TABLE IF NOT EXISTS question_sharing_sets (
    id BIGSERIAL PRIMARY KEY,
    question_id BIGINT not null,
    sharing_set_id BIGINT not null
);

ALTER TABLE pl_courses ADD COLUMN IF NOT EXISTS sharing_name text;

UPDATE pl_courses SET sharing_name = 'test-course' WHERE title = 'Test Course';

