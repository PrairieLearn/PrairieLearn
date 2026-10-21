-- BLOCK insert_test_grading_job
WITH
  v AS (
    INSERT INTO
      variants (
        question_id,
        course_id,
        course_instance_id,
        user_id,
        authn_user_id,
        variant_seed
      )
    SELECT
      id,
      course_id,
      $course_instance_id,
      $user_id,
      $user_id AS authn_user_id,
      'test'
    FROM
      questions
    WHERE
      course_id = $course_id
      AND deleted_at IS NULL
    LIMIT
      1
    RETURNING
      id
  ),
  s AS (
    INSERT INTO
      submissions (variant_id)
    SELECT
      id
    FROM
      v
    RETURNING
      id
  )
INSERT INTO
  grading_jobs (submission_id, grading_method)
SELECT
  id,
  'AI'
FROM
  s
RETURNING
  id;

-- BLOCK insert_test_job_sequence
INSERT INTO
  job_sequences (number, type, description, legacy, status)
VALUES
  (
    1,
    'ai_grading',
    'Test custom provider',
    FALSE,
    'Success'
  )
RETURNING
  id;

-- BLOCK select_test_ai_grading_job
SELECT
  *
FROM
  ai_grading_jobs
WHERE
  id = $id;

-- BLOCK count_test_job_sequences
SELECT
  count(*)::integer
FROM
  job_sequences
WHERE
  type = 'ai_grading';
