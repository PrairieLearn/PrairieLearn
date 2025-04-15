-- BLOCK select_instance_questions_for_assessment_question
SELECT
  *
FROM
  instance_questions AS iq
WHERE
  iq.assessment_question_id = $assessment_question_id
  AND iq.status != 'unanswered';

-- BLOCK select_last_submission_id
SELECT
  s.id
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

-- BLOCK select_embedding_for_submission
SELECT
  *
FROM
  submission_grading_context_embeddings AS emb
WHERE
  emb.submission_id = $submission_id;

-- BLOCK select_closest_submission_info
WITH
  latest_submissions AS (
    SELECT
      s.id AS s_id,
      iq.id AS iq_id,
      iq.score_perc AS iq_score_perc,
      s.feedback,
      s.is_ai_graded AS is_ai_graded,
      s.manual_rubric_grading_id AS s_manual_rubric_grading_id,
      ROW_NUMBER() OVER (
        PARTITION BY
          s.variant_id
        ORDER BY
          s.date DESC
      ) AS rn
    FROM
      instance_questions iq
      JOIN variants v ON iq.id = v.instance_question_id
      JOIN submissions s ON v.id = s.variant_id
    WHERE
      iq.assessment_question_id = $assessment_question_id
      AND NOT iq.requires_manual_grading
      AND iq.status != 'unanswered'
      AND s.id != $submission_id
  )
SELECT
  emb.submission_text,
  ls.s_manual_rubric_grading_id AS manual_rubric_grading_id,
  ls.iq_score_perc AS score_perc,
  ls.feedback,
  ls.iq_id AS instance_question_id
FROM
  latest_submissions ls
  JOIN submission_grading_context_embeddings AS emb ON (emb.submission_id = ls.s_id)
WHERE
  ls.rn = 1
  AND NOT ls.is_ai_graded
ORDER BY
  embedding <=> $embedding
LIMIT
  $limit;

-- BLOCK select_rubric_for_grading
SELECT
  ri.*
FROM
  assessment_questions aq
  JOIN rubric_items ri ON aq.manual_rubric_id = ri.rubric_id
WHERE
  aq.id = $assessment_question_id
  AND ri.deleted_at IS NULL
ORDER BY
  ri.number;

-- BLOCK select_rubric_grading_items
SELECT
  ri.*
FROM
  rubric_grading_items AS rgi
  JOIN rubric_items AS ri ON rgi.rubric_item_id = ri.id
WHERE
  rgi.rubric_grading_id = $manual_rubric_grading_id;

-- BLOCK select_rubric_id_from_grading
SELECT
  rubric_id
FROM
  rubric_gradings
WHERE
  id = $manual_rubric_grading_id
LIMIT
  1;

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

-- BLOCK insert_grading_job
INSERT INTO
  grading_jobs (
    submission_id,
    auth_user_id,
    graded_by,
    graded_at,
    grading_method,
    correct,
    score,
    auto_points,
    manual_points,
    feedback,
    manual_rubric_grading_id
  )
VALUES
  (
    $submission_id,
    $authn_user_id,
    $authn_user_id,
    now(),
    $grading_method,
    $correct,
    $score,
    $auto_points,
    $manual_points,
    $feedback,
    $manual_rubric_grading_id
  )
RETURNING
  id;
