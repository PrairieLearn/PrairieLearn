-- BLOCK upsert_oauth_record
INSERT INTO
  oauth_records (
    model,
    id,
    payload,
    grant_id,
    uid,
    user_id,
    expires_at
  )
VALUES
  (
    $model,
    $id,
    $payload,
    $grant_id,
    $uid,
    $user_id,
    $expires_at
  )
ON CONFLICT (model, id) DO UPDATE
SET
  payload = excluded.payload,
  grant_id = excluded.grant_id,
  uid = excluded.uid,
  user_id = excluded.user_id,
  expires_at = excluded.expires_at;

-- BLOCK select_oauth_record
SELECT
  *
FROM
  oauth_records
WHERE
  model = $model
  AND id = $id
  AND (
    expires_at IS NULL
    OR expires_at > now()
  );

-- BLOCK select_oauth_record_by_uid
SELECT
  *
FROM
  oauth_records
WHERE
  model = $model
  AND uid = $uid
  AND (
    expires_at IS NULL
    OR expires_at > now()
  );

-- BLOCK consume_oauth_record
UPDATE oauth_records
SET
  consumed_at = now()
WHERE
  model = $model
  AND id = $id
  AND consumed_at IS NULL;

-- BLOCK delete_oauth_record
DELETE FROM oauth_records
WHERE
  model = $model
  AND id = $id;

-- BLOCK delete_oauth_records_by_grant_id
DELETE FROM oauth_records
WHERE
  grant_id = $grant_id;

-- BLOCK select_oauth_grants_for_user
SELECT
  to_jsonb(g.*) AS oauth_grant,
  to_jsonb(c.*) AS oauth_client
FROM
  oauth_records AS g
  JOIN oauth_records AS c ON (
    c.model = 'Client'
    AND c.id = g.payload ->> 'clientId'
  )
WHERE
  g.model = 'Grant'
  AND g.user_id = $user_id
  AND g.expires_at > now()
ORDER BY
  g.payload -> 'iat' DESC,
  g.id;

-- BLOCK delete_oauth_grant_for_user
WITH
  deleted_grant AS (
    DELETE FROM oauth_records
    WHERE
      model = 'Grant'
      AND id = $id
      AND user_id = $user_id
    RETURNING
      id
  ),
  deleted_tokens AS (
    DELETE FROM oauth_records
    WHERE
      grant_id IN (
        SELECT
          id
        FROM
          deleted_grant
      )
  )
SELECT
  id
FROM
  deleted_grant;
