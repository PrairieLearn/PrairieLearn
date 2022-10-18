CREATE TABLE IF NOT EXISTS sharing_sets (
    id BIGSERIAL PRIMARY KEY,
    course_id BIGINT NOT NULL REFERENCES pl_courses ON DELETE CASCADE ON UPDATE CASCADE,
    description text,
    name text,
    number INTEGER
);

CREATE TABLE IF NOT EXISTS question_sharing_sets (
    id BIGSERIAL PRIMARY KEY,
    question_id BIGINT NOT NULL,
    sharing_set_id BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS course_sharing_sets (
    id BIGSERIAL PRIMARY KEY,
    course_id BIGINT NOT NULL REFERENCES pl_courses ON DELETE CASCADE ON UPDATE CASCADE,
    sharing_set_id BIGINT NOT NULL REFERENCES sharing_sets ON DELETE CASCADE ON UPDATE CASCADE,
);

ALTER TABLE pl_courses ADD COLUMN IF NOT EXISTS sharing_name text;


-- Need to run (or re-run) after the test course is synced
UPDATE pl_courses SET sharing_name = 'test-course' WHERE title = 'Test Course';

