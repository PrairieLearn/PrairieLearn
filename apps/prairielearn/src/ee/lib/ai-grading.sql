-- BLOCK select_instance_questions_manual_grading
SELECT
  iq.*
FROM
  instance_questions AS iq
WHERE
  iq.assessment_question_id = $assessment_question_id
  AND iq.requires_manual_grading
  AND iq.status != 'unanswered';

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

-- BLOCK select_closest_embeddings
WITH
  latest_submissions AS (
    SELECT
      s.id AS s_id,
      iq.id AS iq_id,
      iq.score_perc AS iq_score_perc,
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
  ls.iq_score_perc AS score_perc,
  ls.iq_id AS instance_question_id
FROM
  latest_submissions ls
  JOIN submission_grading_context_embeddings AS emb ON (emb.submission_id = ls.s_id)
WHERE
  ls.rn = 1
ORDER BY
  embedding <=> $embedding
LIMIT
  $limit;
