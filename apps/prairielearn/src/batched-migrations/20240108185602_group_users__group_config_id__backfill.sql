-- BLOCK update_group_users_group_config_id
UPDATE group_users AS gu
SET
  group_config_id = g.group_config_id
FROM
  groups AS g
WHERE
  gu.team_id = g.id
  AND gu.team_id >= $min
  AND gu.team_id <= $max;
