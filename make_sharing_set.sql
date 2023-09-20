-- Need to run (or re-run) after the test course is synced
-- Run with command:
-- docker exec -it mypl psql postgres -f PrairieLearn/make_sharing_set.sql
UPDATE pl_courses
SET
  sharing_name = 'test-course'
WHERE
  title = 'Test Course';

UPDATE pl_courses
SET
  sharing_name = 'example-course'
WHERE
  title = 'Example Course';

-- UPDATE pl_courses SET sharing_token = '390bd8c3-7461-4b05-b5f8-dd5c821109d8' WHERE title = 'Test Course';
-- UPDATE pl_courses
-- SET
--   question_sharing_enabled = true
-- WHERE
--   title IN ('Test Course', 'Example Course');
INSERT INTO
  feature_grants (name, institution_id, course_id, user_id)
values
  ('question-sharing', null, null, null);

-- from
--   pl_courses
-- where
--   title IN ('Test Course', 'Example Course');
INSERT INTO
  sharing_sets (course_id, name)
select
  id,
  'to-test'
from
  pl_courses
WHERE
  title = 'Example Course';

INSERT INTO
  sharing_sets (course_id, name)
select
  id,
  'to-example'
from
  pl_courses
WHERE
  title = 'Test Course';

-- ON CONFLICT (course_id, name) DO NOTHING;
INSERT INTO
  sharing_sets (course_id, name)
select
  id,
  'blah'
from
  pl_courses
WHERE
  title = 'Example Course';

INSERT INTO
  sharing_set_questions (question_id, sharing_set_id)
select
  id,
  1
from
  questions
where
  qid in ('element/numberInput', 'downloadFile');

INSERT INTO
  sharing_set_questions (question_id, sharing_set_id)
select
  id,
  2
from
  questions
where
  qid in ('element/numberInput', 'downloadFile');

INSERT INTO
  sharing_set_courses (course_id, sharing_set_id)
select
  id,
  1
from
  pl_courses
where
  title = 'Test Course';

INSERT INTO
  sharing_set_courses (course_id, sharing_set_id)
select
  id,
  2
from
  pl_courses
where
  title = 'Example Course';

select
  id,
  qid
from
  questions
where
  qid = 'downloadFile';
