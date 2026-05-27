-- BLOCK select_question_user
SELECT
  u.uid,
  u.uin,
  u.name
FROM
  users AS u
WHERE
  u.id = $user_id;

-- BLOCK select_team_with_members
SELECT
  t.name,
  COALESCE(
    (
      SELECT
        JSONB_AGG(
          JSONB_BUILD_OBJECT('uid', u.uid, 'uin', u.uin, 'name', u.name)
          ORDER BY
            u.uid
        )
      FROM
        team_users AS tu
        JOIN users AS u ON (u.id = tu.user_id)
      WHERE
        tu.team_id = t.id
    ),
    '[]'::jsonb
  ) AS members
FROM
  teams AS t
WHERE
  t.id = $team_id
  AND t.deleted_at IS NULL;
