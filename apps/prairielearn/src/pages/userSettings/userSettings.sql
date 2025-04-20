-- BLOCK select_access_tokens
SELECT
  id,
  name,
  token,
  token_hash,
  format_date_full_compact (created_at, 'UTC') AS created_at,
  format_date_full_compact (last_used_at, 'UTC') AS last_used_at
FROM
  access_tokens
WHERE
  user_id = $user_id
ORDER BY
  created_at DESC;

-- BLOCK clear_tokens_for_user
UPDATE access_tokens
SET
  token = NULL
WHERE
  user_id = $user_id
  AND token IS NOT NULL;

-- BLOCK insert_access_token
WITH
  new_row AS (
    INSERT INTO
      access_tokens AS a (name, user_id, token, token_hash)
    VALUES
      ($name, $user_id, $token, $token_hash)
    RETURNING
      a.*
  )
INSERT INTO
  audit_logs (
    user_id,
    authn_user_id,
    table_name,
    row_id,
    action,
    new_state
  )
SELECT
  user_id,
  user_id,
  'access_tokens',
  new_row.id,
  'insert',
  to_jsonb(new_row) - 'token'
FROM
  new_row;

-- BLOCK delete_access_token
WITH
  old_row AS (
    DELETE FROM access_tokens AS a
    WHERE
      a.user_id = $user_id
      AND a.id = $token_id
    RETURNING
      a.*
  )
INSERT INTO
  audit_logs (
    authn_user_id,
    user_id,
    table_name,
    row_id,
    action,
    old_state
  )
SELECT
  $user_id,
  user_id,
  'access_tokens',
  old_row.id,
  'delete',
  to_jsonb(old_row) - 'token'
FROM
  old_row;
