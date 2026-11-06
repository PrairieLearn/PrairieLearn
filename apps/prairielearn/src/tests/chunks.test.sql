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

-- BLOCK select_all_chunks
SELECT
  *
FROM
  chunks
WHERE
  course_id = $course_id;

-- BLOCK drop_unique_chunk_index
DROP INDEX chunks_unique_values_key;

-- BLOCK append_chunk_revisions
INSERT INTO
  chunks (
    type,
    course_id,
    question_id,
    course_instance_id,
    assessment_id,
    uuid,
    created_at
  )
SELECT
  type,
  course_id,
  question_id,
  course_instance_id,
  assessment_id,
  gen_random_uuid(),
  now()
FROM
  chunks
WHERE
  course_id = $course_id
  AND type = ANY ($types::enum_chunk_type[]);
