-- BLOCK select_receipt
SELECT
  *
FROM
  course_agent_budget_requests
WHERE
  conversation_id = $conversation_id
  AND sequence = $sequence;

-- BLOCK select_next_sequence
SELECT
  COALESCE(MAX(sequence), 0) + 1
FROM
  course_agent_budget_requests
WHERE
  conversation_id = $conversation_id;

-- BLOCK select_allocated
SELECT
  COALESCE(SUM(granted_milli_dollars), 0)
FROM
  course_agent_budget_requests
WHERE
  user_id = $user_id
  AND window_start = $window_start
  AND granted_milli_dollars > 0;

-- BLOCK insert_receipt
INSERT INTO
  course_agent_budget_requests (
    conversation_id,
    user_id,
    sequence,
    window_start,
    request,
    response,
    http_status,
    granted_milli_dollars
  )
VALUES
  (
    $conversation_id,
    $user_id,
    $sequence,
    $window_start,
    $request::jsonb,
    $response::jsonb,
    $http_status,
    $granted_milli_dollars
  );
