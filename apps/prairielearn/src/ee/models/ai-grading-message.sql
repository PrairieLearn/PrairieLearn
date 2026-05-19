-- BLOCK select_ai_grading_messages
SELECT
  *
FROM
  ai_grading_messages
WHERE
  assessment_question_id = $assessment_question_id
ORDER BY
  created_at ASC;

-- BLOCK delete_ai_grading_messages
DELETE FROM ai_grading_messages
WHERE
  assessment_question_id = $assessment_question_id;

-- BLOCK delete_ai_grading_messages_by_ids
DELETE FROM ai_grading_messages
WHERE
  assessment_question_id = $assessment_question_id
  AND id IN (
    SELECT
      UNNEST($ids::BIGINT[])
  );

-- BLOCK select_latest_streaming_ai_grading_message
SELECT
  *
FROM
  ai_grading_messages
WHERE
  assessment_question_id = $assessment_question_id
  AND role = 'assistant'
  AND status = 'streaming'
ORDER BY
  created_at DESC
LIMIT
  1;

-- BLOCK cancel_latest_streaming_ai_grading_message
UPDATE ai_grading_messages
SET
  status = 'canceled',
  updated_at = NOW()
WHERE
  assessment_question_id = $assessment_question_id
  AND status = 'streaming'
  AND role = 'assistant';

-- BLOCK select_ai_grading_message_by_id
SELECT
  *
FROM
  ai_grading_messages
WHERE
  id = $id
  AND assessment_question_id = $assessment_question_id;

-- BLOCK select_first_ai_grading_message
SELECT
  *
FROM
  ai_grading_messages
WHERE
  assessment_question_id = $assessment_question_id
ORDER BY
  created_at ASC
LIMIT
  1;

-- BLOCK select_nth_completed_ai_grading_message
SELECT
  *
FROM
  ai_grading_messages
WHERE
  assessment_question_id = $assessment_question_id
  AND status = 'completed'
ORDER BY
  created_at ASC
LIMIT
  1
OFFSET
  $offset;

-- BLOCK count_completed_ai_grading_messages
SELECT
  count(*)::int AS count
FROM
  ai_grading_messages
WHERE
  assessment_question_id = $assessment_question_id
  AND status = 'completed';

-- BLOCK select_completed_assistant_ai_grading_messages
SELECT
  *
FROM
  ai_grading_messages
WHERE
  assessment_question_id = $assessment_question_id
  AND status = 'completed'
  AND role = 'assistant'
ORDER BY
  created_at ASC;
