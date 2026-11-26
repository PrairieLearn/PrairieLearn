-- BLOCK insert_oauth_grant
WITH
  new_grant AS (
    INSERT INTO
      oauth_grants (
        user_id,
        oauth_client_id,
        scopes,
        resource,
        expires_at
      )
    VALUES
      (
        $user_id,
        $oauth_client_id,
        $scopes,
        $resource,
        $expires_at
      )
    RETURNING
      *
  ),
  new_courses AS (
    INSERT INTO
      oauth_grant_courses (oauth_grant_id, course_id)
    SELECT
      new_grant.id,
      course_id
    FROM
      new_grant,
      unnest($course_ids::bigint[]) AS course_id
  )
SELECT
  *
FROM
  new_grant;

-- BLOCK select_oauth_grant_courses
SELECT
  c.*
FROM
  oauth_grant_courses AS gc
  JOIN courses AS c ON (c.id = gc.course_id)
WHERE
  gc.oauth_grant_id = $oauth_grant_id
  AND c.deleted_at IS NULL
ORDER BY
  c.short_name,
  c.id;

-- BLOCK revoke_oauth_grant
UPDATE oauth_grants
SET
  revoked_at = now()
WHERE
  id = $id
  AND revoked_at IS NULL;

-- BLOCK update_oauth_grant_last_used
UPDATE oauth_grants
SET
  last_used_at = now()
WHERE
  id = $id;

-- BLOCK select_oauth_grant_by_id
SELECT
  *
FROM
  oauth_grants
WHERE
  id = $id;

-- BLOCK select_active_oauth_grants_for_user
SELECT
  to_jsonb(g.*) AS oauth_grant,
  to_jsonb(cl.*) AS oauth_client,
  coalesce(
    (
      SELECT
        jsonb_agg(
          to_jsonb(c.*)
          ORDER BY
            c.short_name,
            c.id
        )
      FROM
        oauth_grant_courses AS gc
        JOIN courses AS c ON (c.id = gc.course_id)
      WHERE
        gc.oauth_grant_id = g.id
        AND c.deleted_at IS NULL
    ),
    '[]'::jsonb
  ) AS courses
FROM
  oauth_grants AS g
  JOIN oauth_clients AS cl ON (cl.id = g.oauth_client_id)
WHERE
  g.user_id = $user_id
  AND g.revoked_at IS NULL
  AND g.expires_at > now()
ORDER BY
  g.created_at DESC,
  g.id DESC;
