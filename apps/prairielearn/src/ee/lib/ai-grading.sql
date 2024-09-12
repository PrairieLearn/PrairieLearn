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
  submission_grading_context_embeddings (embedding, submission_id, submission_text)
VALUES
  ($embedding, $submission_id, $submission_text);

-- BLOCK select_closest_embeddings
SELECT
  emb.embedding, emb.submission_text, iq.id AS instance_question_id
FROM
  (SELECT s.id, MAX(g.graded_at)
    FROM (SELECT * FROM grading_jobs WHERE graded_by != $ai_grader_id) AS g
    JOIN (SELECT * FROM submissions WHERE id != $submission_id) AS s ON (g.submission_id=s.id)
    WHERE g.graded_at = s.graded_at
    GROUP BY s.id) AS s_filter
  JOIN submissions AS s ON (s_filter.id=s.id)
  JOIN submission_grading_context_embeddings AS emb ON (emb.submission_id = s.id)
  JOIN variants AS v ON (s.variant_id = v.id)
  JOIN instance_questions AS iq ON (v.instance_question_id=iq.id)
WHERE
  iq.assessment_question_id=$assessment_question_id
ORDER BY
  embedding <=> $embedding
LIMIT
  $limit;
