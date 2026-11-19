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

-- BLOCK select_publication_date
SELECT
  qv.created_at::text
FROM
  question_versions AS qv
  JOIN question_version_settings AS s ON s.question_version_id = qv.id
WHERE
  qv.question_id = $question_id
  AND qv.uses_chunks
  AND qv.superseded_at IS NULL;

-- BLOCK select_chunk_creation_date
SELECT
  created_at::text
FROM
  chunks
WHERE
  id = $chunk_id;

-- BLOCK reject_settings
ALTER TABLE question_version_settings
ADD CONSTRAINT reject_settings CHECK (FALSE) NOT VALID;

-- BLOCK allow_settings
ALTER TABLE question_version_settings
DROP CONSTRAINT reject_settings;
