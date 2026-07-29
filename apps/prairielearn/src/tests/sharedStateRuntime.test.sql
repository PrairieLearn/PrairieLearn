-- BLOCK select_instance_question_by_qid
SELECT
  iq.id
FROM
  instance_questions AS iq
  JOIN assessment_questions AS aq ON (aq.id = iq.assessment_question_id)
  JOIN questions AS q ON (q.id = aq.question_id)
WHERE
  iq.assessment_instance_id = $assessment_instance_id
  AND q.qid = $qid;

-- BLOCK select_variant_by_id
SELECT
  *
FROM
  variants
WHERE
  id = $variant_id;

-- BLOCK select_last_submission_for_variant
SELECT
  *
FROM
  submissions
WHERE
  variant_id = $variant_id
ORDER BY
  date DESC
LIMIT
  1;

-- BLOCK select_user_shared_state_value
SELECT
  v.*
FROM
  user_shared_state_values AS v
  JOIN shared_state_objects AS o ON (o.id = v.shared_state_object_id)
WHERE
  v.user_id = $user_id
  AND o.name = $name;
