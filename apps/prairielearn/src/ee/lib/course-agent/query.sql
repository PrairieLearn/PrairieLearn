-- BLOCK select_claim_key
SELECT
  key
FROM
  course_agent.claim_keys;

-- BLOCK configure_session
-- Runs on the reader connection with positional parameters. The connection is
-- discarded after one query, so these session settings never outlive it.
SELECT
  set_config('statement_timeout', $1, false),
  set_config('default_transaction_read_only', 'on', false),
  set_config('course_agent.claims', $2, false);
