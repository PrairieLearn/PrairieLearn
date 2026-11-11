-- BLOCK select_course_by_path
SELECT
  *
FROM
  courses
WHERE
  path = $course_path;

-- BLOCK select_course_instance
SELECT
  id
FROM
  course_instances
WHERE
  long_name = $long_name
  AND deleted_at IS NULL;

-- BLOCK select_assessment
SELECT
  id
FROM
  assessments
WHERE
  tid = $tid
  AND deleted_at IS NULL;

-- BLOCK select_question
SELECT
  id
FROM
  questions
WHERE
  qid = $qid
  AND deleted_at IS NULL;

-- BLOCK prepare_history_baseline
UPDATE chunks
SET
  created_at = CASE
    WHEN type = 'clientFilesCourse' THEN NULL
    ELSE $created_at::timestamptz
  END
WHERE
  course_id = $course_id;

-- BLOCK select_question_versions
SELECT
  qv.*
FROM
  question_versions AS qv
  JOIN chunks AS c ON c.id = qv.chunk_id
WHERE
  c.question_id = $question_id
ORDER BY
  c.id;
