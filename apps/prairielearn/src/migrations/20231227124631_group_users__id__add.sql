ALTER TABLE group_users
ADD UNIQUE (group_id, user_id),
DROP CONSTRAINT group_users_pkey CASCADE,
ADD COLUMN id BIGSERIAL PRIMARY KEY;

-- Group_id does not need its own index because it is already indexed as part of a unique constraint.
DROP INDEX group_users_group_id_key;

ALTER TABLE group_user_roles
ADD COLUMN group_user_id BIGINT REFERENCES group_users (id) ON DELETE CASCADE;

UPDATE group_user_roles gur
SET
  group_user_id = gu.id
FROM
  group_users gu
WHERE
  gu.group_id = gur.group_id
  AND gu.user_id = gur.user_id;

DELETE FROM group_user_roles
WHERE
  group_user_id IS NULL;
