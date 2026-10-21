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

-- BLOCK select_test_instance_question_id
SELECT
  id
FROM
  instance_questions
WHERE
  assessment_instance_id = $assessment_instance_id;

-- BLOCK select_test_grading_result
SELECT
  to_jsonb(agj.*) AS ai_grading_job,
  to_jsonb(gj.*) AS grading_job,
  to_jsonb(iq.*) AS instance_question
FROM
  ai_grading_jobs AS agj
  JOIN grading_jobs AS gj ON gj.id = agj.grading_job_id
  JOIN submissions AS s ON s.id = gj.submission_id
  JOIN variants AS v ON v.id = s.variant_id
  JOIN instance_questions AS iq ON iq.id = v.instance_question_id
WHERE
  agj.job_sequence_id = $job_sequence_id;

-- BLOCK select_test_assessment_question
SELECT
  *
FROM
  assessment_questions
WHERE
  id = $id;

-- BLOCK count_test_job_sequences
SELECT
  count(*)::integer
FROM
  job_sequences
WHERE
  type = 'ai_grading';
