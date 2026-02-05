-- BLOCK is_user_in_team
SELECT
  EXISTS (
    SELECT
      1
    FROM
      team_users
    WHERE
      team_id = $team_id
      AND user_id = $user_id
  ) AS is_member;
