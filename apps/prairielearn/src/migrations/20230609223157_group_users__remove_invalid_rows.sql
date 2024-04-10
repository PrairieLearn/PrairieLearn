DELETE FROM group_users AS gu USING groups AS g
WHERE
  gu.group_id = g.id
  AND g.deleted_at IS NOT NULL;
