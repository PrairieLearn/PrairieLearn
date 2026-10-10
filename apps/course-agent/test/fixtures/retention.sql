-- BLOCK counts
SELECT
  'messages' AS name,
  COUNT(*) AS count
FROM
  cf_agents_session_messages
UNION ALL
SELECT
  'chunks',
  COUNT(*)
FROM
  cf_agents_session_message_chunks
UNION ALL
SELECT
  'executions',
  COUNT(*)
FROM
  execution_receipts
UNION ALL
SELECT
  'rejections',
  COUNT(*)
FROM
  rejected_dispatches
UNION ALL
SELECT
  'context',
  COUNT(*)
FROM
  cf_ai_chat_request_context;
