-- BLOCK select_rubric_grading_items
SELECT
  ri.*
FROM
  rubric_grading_items AS rgi
  JOIN rubric_items AS ri ON rgi.rubric_item_id = ri.id
WHERE
  rgi.rubric_grading_id = $manual_rubric_grading_id;

-- BLOCK select_last_variant_and_submission
SELECT
  to_jsonb(v.*) AS variant,
  to_jsonb(s.*) AS submission
FROM
  variants AS v
  JOIN submissions AS s ON (s.variant_id = v.id)
WHERE
  v.instance_question_id = $instance_question_id
ORDER BY
  v.date DESC,
  s.date DESC
LIMIT
  1;

-- BLOCK create_embedding_for_submission
INSERT INTO
  submission_grading_context_embeddings (
    embedding,
    submission_id,
    submission_text,
    assessment_question_id
  )
VALUES
  (
    $embedding,
    $submission_id,
    $submission_text,
    $assessment_question_id
  )
RETURNING
  *;

-- BLOCK select_instance_questions_for_assessment_question
SELECT
  *
FROM
  instance_questions AS iq
WHERE
  iq.assessment_question_id = $assessment_question_id
  AND iq.status != 'unanswered';

-- BLOCK insert_ai_grading_job
INSERT INTO
  ai_grading_jobs (
    grading_job_id,
    job_sequence_id,
    prompt,
    completion,
    model,
    prompt_tokens,
    completion_tokens,
    cost,
    course_id,
    course_instance_id
  )
VALUES
  (
    $grading_job_id,
    $job_sequence_id,
    to_jsonb($prompt::text[]),
    $completion,
    $model,
    $prompt_tokens,
    $completion_tokens,
    $cost,
    $course_id,
    $course_instance_id
  );

-- BLOCK select_last_variant_and_submission
SELECT
  to_jsonb(v.*) AS variant,
  to_jsonb(s.*) AS submission
FROM
  variants AS v
  JOIN submissions AS s ON (s.variant_id = v.id)
WHERE
  v.instance_question_id = $instance_question_id
ORDER BY
  v.date DESC,
  s.date DESC
LIMIT
  1;
