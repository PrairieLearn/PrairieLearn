-- BLOCK insert_query_run
INSERT INTO
  query_runs (name, params, error, result, authn_user_id)
VALUES
  ($name, $params, $error, $result, $authn_user_id)
RETURNING
  id;

-- BLOCK select_query_run
SELECT
  *
FROM
  query_runs
WHERE
  id = $query_run_id;

-- BLOCK select_recent_query_runs
SELECT
  qr.*,
  u.name AS user_name,
  u.uid AS user_uid
FROM
  query_runs AS qr
  LEFT JOIN users u ON (u.user_id = qr.authn_user_id)
WHERE
  qr.name = $query_name
ORDER BY
  date DESC
LIMIT
  10;
