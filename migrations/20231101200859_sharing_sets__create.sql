CREATE TABLE IF NOT EXISTS sharing_sets (
    id BIGSERIAL PRIMARY KEY,
    course_id BIGINT NOT NULL REFERENCES pl_courses ON DELETE CASCADE ON UPDATE CASCADE,
    name text,
    description text,
    UNIQUE (course_id, name)
);

CREATE TABLE IF NOT EXISTS sharing_set_questions (
    id BIGSERIAL PRIMARY KEY,
    sharing_set_id BIGINT NOT NULL,
    question_id BIGINT NOT NULL,
    UNIQUE(sharing_set_id, question_id)
);

ALTER TABLE sharing_set_questions
ADD CONSTRAINT sharing_set_questions_question_id_fkey
FOREIGN KEY (question_id) REFERENCES questions(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE sharing_set_questions
ADD CONSTRAINT sharing_set_questions_sharing_set_id_fkey
FOREIGN KEY (sharing_set_id) REFERENCES sharing_sets(id) ON UPDATE CASCADE ON DELETE CASCADE;

CREATE TABLE IF NOT EXISTS sharing_set_courses (
    id BIGSERIAL PRIMARY KEY,
    sharing_set_id BIGINT NOT NULL REFERENCES sharing_sets ON DELETE CASCADE ON UPDATE CASCADE,
    course_id BIGINT NOT NULL REFERENCES pl_courses ON DELETE CASCADE ON UPDATE CASCADE,
    UNIQUE(sharing_set_id, course_id)
);

ALTER TABLE pl_courses ADD COLUMN IF NOT EXISTS sharing_name text;
ALTER TABLE pl_courses ADD COLUMN IF NOT EXISTS sharing_id text;
ALTER TABLE pl_courses ADD COLUMN IF NOT EXISTS question_sharing_enabled boolean default false;


-- TODO: remove everything below here before merging
-- Need to run (or re-run) after the test course is synced
-- Run with command:
-- docker exec -it mypl psql postgres -f PrairieLearn/migrations/20231101200859_sharing_sets__create.sql
UPDATE pl_courses SET sharing_name = 'test-course' WHERE title = 'Test Course';
-- UPDATE pl_courses SET sharing_id = '390bd8c3-7461-4b05-b5f8-dd5c821109d8' WHERE title = 'Test Course';

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

INSERT INTO sharing_set_questions
    (question_id, sharing_set_id)
    select
        id, 1
    from questions where qid = 'addNumbers';

INSERT INTO sharing_set_courses
    (course_id, sharing_set_id)
    select
        id, 1
    from pl_courses where title = 'Example Course';
