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
  s.*
FROM
  question_version_settings AS s
  JOIN question_versions AS qv ON qv.id = s.question_version_id
WHERE
  qv.question_id = $question_id
  AND qv.uses_chunks
ORDER BY
  qv.id;

-- BLOCK select_question_publications
SELECT
  qv.created_at::text AS version_date,
  c.created_at::text AS chunk_date,
  qv.id AS version_id,
  c.id AS chunk_id
FROM
  question_versions AS qv
  JOIN chunks AS c ON c.question_id = qv.question_id
  AND c.type = 'question'
  AND c.created_at <= qv.created_at
  AND (
    c.superseded_at IS NULL
    OR c.superseded_at > qv.created_at
  )
WHERE
  qv.question_id = $question_id
  AND qv.uses_chunks
ORDER BY
  qv.id;

-- BLOCK reject_settings
ALTER TABLE question_version_settings
ADD CONSTRAINT reject_settings CHECK (FALSE) NOT VALID;

-- BLOCK allow_settings
ALTER TABLE question_version_settings
DROP CONSTRAINT reject_settings;
