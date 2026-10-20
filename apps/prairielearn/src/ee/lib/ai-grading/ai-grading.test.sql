-- BLOCK insert_test_ai_grading_job_sequence
INSERT INTO
  job_sequences (
    number,
    type,
    description,
    legacy,
    status,
    assessment_question_id
  )
VALUES
  (
    1,
    $type,
    'test',
    FALSE,
    $status::enum_job_status,
    $assessment_question_id
  )
RETURNING
  id;

-- BLOCK select_status
SELECT
  status::text
FROM
  job_sequences
WHERE
  id = $job_sequence_id;

-- BLOCK delete_test_ai_grading_sequences
DELETE FROM job_sequences
WHERE
  assessment_question_id = $assessment_question_id
  AND type = 'ai_grading';

-- BLOCK insert_submission_with_ai_grading
WITH
  new_assessment_instance AS (
    INSERT INTO
      assessment_instances (assessment_id, user_id, number, max_points)
    SELECT
      aq.assessment_id,
      $authn_user_id,
      1,
      aq.max_points
    FROM
      assessment_questions AS aq
    WHERE
      aq.id = $assessment_question_id
    RETURNING
      id
  ),
  new_instance_question AS (
    INSERT INTO
      instance_questions (
        assessment_instance_id,
        assessment_question_id,
        is_ai_graded
      )
    SELECT
      id,
      $assessment_question_id,
      TRUE
    FROM
      new_assessment_instance
    RETURNING
      id
  ),
  new_variant AS (
    INSERT INTO
      variants (
        instance_question_id,
        question_id,
        course_id,
        user_id,
        authn_user_id,
        variant_seed
      )
    SELECT
      iq.id,
      q.id,
      q.course_id,
      $authn_user_id,
      $authn_user_id,
      '1'
    FROM
      new_instance_question AS iq
      JOIN assessment_questions AS aq ON (aq.id = $assessment_question_id)
      JOIN questions AS q ON (q.id = aq.question_id)
    RETURNING
      id
  ),
  new_submission AS (
    INSERT INTO
      submissions (variant_id, is_ai_graded, feedback)
    SELECT
      id,
      TRUE,
      '{"manual": "AI feedback"}'::jsonb
    FROM
      new_variant
    RETURNING
      id
  ),
  prior_grading_job AS (
    INSERT INTO
      grading_jobs (
        submission_id,
        grading_method,
        feedback,
        manual_points
      )
    SELECT
      id,
      $grading_method::enum_grading_method,
      '{"manual": "Previous feedback"}'::jsonb,
      2
    FROM
      new_submission
    WHERE
      $grading_method::enum_grading_method IS NOT NULL
  ),
  ai_grading_job AS (
    INSERT INTO
      grading_jobs (submission_id, grading_method, feedback)
    SELECT
      id,
      'AI',
      '{"manual": "AI feedback"}'::jsonb
    FROM
      new_submission
  )
SELECT
  id
FROM
  new_submission;
