-- BLOCK select_instance_questions_manual_grading
SELECT
  iq.*
FROM
  instance_questions AS iq
  JOIN assessment_instances AS ai ON (ai.id = iq.assessment_instance_id)
WHERE
  ai.assessment_id = $assessment_id
  AND iq.assessment_question_id = $assessment_question_id
  AND iq.requires_manual_grading
  AND iq.status != 'unanswered';

-- BLOCK select_all_instance_questions
SELECT
  iq.*
FROM
  instance_questions AS iq
  JOIN assessment_instances AS ai ON (ai.id = iq.assessment_instance_id)
WHERE
  ai.assessment_id = $assessment_id
  AND iq.assessment_question_id = $assessment_question_id
  AND iq.status != 'unanswered';

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

-- BLOCK update_embedding_for_submission
INSERT INTO
  submission_grading_context_embeddings (id, embedding, submission_id, submission_text)
VALUES
  (1, $embedding, $submission_id, $submission_text);
