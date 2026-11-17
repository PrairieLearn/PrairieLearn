-- BLOCK sync_question_sharing_sets
INSERT INTO
  sharing_set_questions (question_id, sharing_set_id)
SELECT
  question_id,
  sharing_set_id
FROM
  jsonb_to_recordset($new_question_sharing_sets::jsonb) AS (question_id bigint, sharing_set_id bigint)
ON CONFLICT (question_id, sharing_set_id) DO NOTHING;

-- BLOCK delete_removed_question_sharing_sets
DELETE FROM sharing_set_questions AS ssq USING sharing_sets AS ss
WHERE
  ssq.sharing_set_id = ss.id
  AND ss.course_id = $course_id
  AND ssq.question_id = ANY ($synced_question_ids::bigint[])
  AND (ssq.question_id, ssq.sharing_set_id) NOT IN (
    SELECT
      question_id,
      sharing_set_id
    FROM
      jsonb_to_recordset($new_question_sharing_sets::jsonb) AS (question_id bigint, sharing_set_id bigint)
  );

-- BLOCK sync_course_sharing_sets
INSERT INTO
  sharing_sets (course_id, name, description)
SELECT
  $course_id,
  name,
  description
FROM
  jsonb_to_recordset($new_course_sharing_sets::jsonb) AS (name text, description text)
ON CONFLICT (course_id, name) DO UPDATE
SET
  description = EXCLUDED.description;

-- BLOCK delete_removed_course_sharing_sets
DELETE FROM sharing_sets
WHERE
  course_id = $course_id
  AND NOT (name = ANY ($sharing_set_names::text[]));

-- BLOCK select_course_sharing_sets
SELECT
  ss.name,
  ss.id
FROM
  sharing_sets AS ss
WHERE
  ss.course_id = $course_id;
