ALTER TABLE group_users
ADD UNIQUE (user_id, group_config_id);

-- This index becomes unnecessary with the new unique constraint
DROP INDEX IF EXISTS group_users_user_id_key;

-- This index is already unnecessary with the existing primary key
DROP INDEX IF EXISTS group_users_group_id_key;
