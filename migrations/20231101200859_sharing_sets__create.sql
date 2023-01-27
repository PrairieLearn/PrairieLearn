CREATE TABLE IF NOT EXISTS sharing_sets (
    id BIGSERIAL PRIMARY KEY,
    course_id BIGINT NOT NULL REFERENCES pl_courses ON DELETE CASCADE ON UPDATE CASCADE,
    name text,
    description text,
    UNIQUE (name, course_id)
);

CREATE TABLE IF NOT EXISTS question_sharing_sets (
    id BIGSERIAL PRIMARY KEY,
    question_id BIGINT NOT NULL,
    sharing_set_id BIGINT NOT NULL
);

ALTER TABLE question_sharing_sets
ADD CONSTRAINT question_sharing_sets_question_id_fkey
FOREIGN KEY (question_id) REFERENCES questions(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE question_sharing_sets
ADD CONSTRAINT question_sharing_sets_sharing_set_id_fkey
FOREIGN KEY (sharing_set_id) REFERENCES sharing_sets(id) ON UPDATE CASCADE ON DELETE CASCADE;


-- TODO: table name here might be confusing. It should denote
-- that these are the courses that are allowed to access a given sharing set
CREATE TABLE IF NOT EXISTS course_sharing_sets (
    id BIGSERIAL PRIMARY KEY,
    course_id BIGINT NOT NULL REFERENCES pl_courses ON DELETE CASCADE ON UPDATE CASCADE,
    sharing_set_id BIGINT NOT NULL REFERENCES sharing_sets ON DELETE CASCADE ON UPDATE CASCADE
);

ALTER TABLE pl_courses ADD COLUMN IF NOT EXISTS sharing_name text;
ALTER TABLE pl_courses ADD COLUMN IF NOT EXISTS sharing_id text;
ALTER TABLE pl_courses ADD COLUMN IF NOT EXISTS question_sharing_enabled boolean default false;


-- TODO: remove everything below here before merging
-- Need to run (or re-run) after the test course is synced
-- Run with command:
-- docker exec -it mypl psql postgres -f PrairieLearn/migrations/20231101200859_sharing_sets__create.sql
UPDATE pl_courses SET sharing_name = 'test-course' WHERE title = 'Test Course';
UPDATE pl_courses SET sharing_id = '390bd8c3-7461-4b05-b5f8-dd5c821109d8' WHERE title = 'Test Course';

UPDATE pl_courses SET question_sharing_enabled = true WHERE title IN ('Test Course', 'Example Course');

INSERT INTO sharing_sets
    (course_id, name, description)
    select
        id, 'to-example', 'Questions to be shared with the example course.'
    from pl_courses WHERE title = 'Test Course';

INSERT INTO sharing_sets
    (course_id, name, description)
    select
        id, 'blah', 'Nonsense sharing set name.'
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
