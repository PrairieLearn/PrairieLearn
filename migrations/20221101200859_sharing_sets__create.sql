CREATE TABLE IF NOT EXISTS sharing_sets (
    id BIGSERIAL PRIMARY KEY,
    course_id BIGINT NOT NULL REFERENCES pl_courses ON DELETE CASCADE ON UPDATE CASCADE,
    name text,
    description text
);

CREATE TABLE IF NOT EXISTS question_sharing_sets (
    id BIGSERIAL PRIMARY KEY,
    question_id BIGINT NOT NULL,
    sharing_set_id BIGINT NOT NULL
);

-- TODO: table name here might be confusing. It should denote
-- that these are the courses that are allowed to access a given sharing set
CREATE TABLE IF NOT EXISTS course_sharing_sets (
    id BIGSERIAL PRIMARY KEY,
    course_id BIGINT NOT NULL REFERENCES pl_courses ON DELETE CASCADE ON UPDATE CASCADE,
    sharing_set_id BIGINT NOT NULL REFERENCES sharing_sets ON DELETE CASCADE ON UPDATE CASCADE
);

ALTER TABLE pl_courses ADD COLUMN IF NOT EXISTS sharing_name text;


-- Need to run (or re-run) after the test course is synced
UPDATE pl_courses SET sharing_name = 'test-course' WHERE title = 'Test Course';
INSERT INTO sharing_sets
    (course_id, name, description)
    select
        id, 'to-example', 'Questions to be shared with the example course.'
    from pl_courses WHERE title = 'Test Course';

INSERT INTO question_sharing_sets
    (question_id, sharing_set_id)
    select
        id, 1
    from questions where qid = 'addNumbers';

INSERT INTO course_sharing_sets
    (course_id, sharing_set_id)
    select
        id, 1
    from pl_courses where title = 'Example Course';

