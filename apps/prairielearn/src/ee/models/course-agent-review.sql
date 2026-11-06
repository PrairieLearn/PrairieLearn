-- BLOCK insert_course_agent_review
INSERT INTO
  course_agent_reviews (
    course_agent_conversation_id,
    agent_review_id,
    decision,
    job_sequence_id,
    result
  )
VALUES
  (
    $course_agent_conversation_id,
    $agent_review_id,
    $decision,
    $job_sequence_id,
    $result
  )
ON CONFLICT (course_agent_conversation_id, agent_review_id) DO NOTHING
RETURNING
  *;

-- BLOCK select_course_agent_review
SELECT
  *
FROM
  course_agent_reviews
WHERE
  course_agent_conversation_id = $course_agent_conversation_id
  AND agent_review_id = $agent_review_id;

-- BLOCK update_course_agent_review_result
UPDATE course_agent_reviews
SET
  result = $result
WHERE
  id = $id
  AND result IS NULL
RETURNING
  *;

-- BLOCK update_course_agent_review_delivered
UPDATE course_agent_reviews
SET
  result_delivered_at = now()
WHERE
  id = $id;

-- BLOCK select_undelivered_course_agent_reviews
SELECT
  to_jsonb(r.*) AS review,
  to_jsonb(c.*) AS conversation
FROM
  course_agent_reviews AS r
  JOIN course_agent_conversations AS c ON (c.id = r.course_agent_conversation_id)
WHERE
  r.result_delivered_at IS NULL
  -- A result still undelivered after a week will not succeed by retrying; Resume can still send it.
  AND (
    $course_agent_conversation_id::bigint IS NOT NULL
    OR r.created_at > now() - interval '7 days'
  )
  AND (
    $course_agent_conversation_id::bigint IS NULL
    OR r.course_agent_conversation_id = $course_agent_conversation_id
  )
ORDER BY
  r.id;
