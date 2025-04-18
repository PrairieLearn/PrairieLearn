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

-- BLOCK select_embedding_for_submission
SELECT
  *
FROM
  submission_grading_context_embeddings AS emb
WHERE
  emb.submission_id = $submission_id;

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
