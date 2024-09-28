-- BLOCK select_course_instance_ids
SELECT
  id,
  short_name
FROM
  course_instances
WHERE
  course_id = $course_id
  -- Exclude deleted course instances since they may have duplicate short names.
  AND deleted_at IS NULL;

-- BLOCK select_question_ids
SELECT
  id,
  qid
FROM
  questions
WHERE
  course_id = $course_id
  -- Exclude deleted questions since they may have duplicate QIDs.
  AND deleted_at IS NULL;
