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

-- BLOCK update_course_agent_review_stuck_reported
UPDATE course_agent_reviews
SET
  stuck_delivery_reported_at = now()
WHERE
  id = $id;

-- BLOCK expire_undelivered_course_agent_reviews
UPDATE course_agent_reviews
SET
  delivery_expired_at = now()
WHERE
  result_delivered_at IS NULL
  AND delivery_expired_at IS NULL
  AND created_at < now() - $cutoff::interval
RETURNING
  id;

-- BLOCK select_undelivered_course_agent_reviews
SELECT
  to_jsonb(r.*) AS review,
  to_jsonb(c.*) AS conversation
FROM
  course_agent_reviews AS r
  JOIN course_agent_conversations AS c ON (c.id = r.course_agent_conversation_id)
WHERE
  r.result_delivered_at IS NULL
  -- The sweep leaves expired results alone; Resume still sends them.
  AND (
    $course_agent_conversation_id::bigint IS NOT NULL
    OR r.delivery_expired_at IS NULL
  )
  AND (
    $course_agent_conversation_id::bigint IS NULL
    OR r.course_agent_conversation_id = $course_agent_conversation_id
  )
ORDER BY
  r.id;
