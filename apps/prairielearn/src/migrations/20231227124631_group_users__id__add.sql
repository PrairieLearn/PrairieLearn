ALTER TABLE group_users
-- Column is added as UNIQUE, but not yet PRIMARY KEY. This is to ensure that
-- any code in servers that are not yet updated to use the new column will not
-- break, and can still use the old primary key for reference and cascading.
ADD COLUMN id BIGSERIAL UNIQUE;

-- Group_id does not need its own index because it is already indexed as part of a unique constraint.
DROP INDEX group_users_group_id_key;

ALTER TABLE group_user_roles
ADD COLUMN group_user_id BIGINT REFERENCES group_users (id) ON DELETE CASCADE ON UPDATE CASCADE;
