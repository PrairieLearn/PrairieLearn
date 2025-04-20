ALTER TABLE group_users
DROP CONSTRAINT IF EXISTS group_users_group_id_fkey;

ALTER TABLE group_users
ADD CONSTRAINT group_users_group_id_fkey FOREIGN KEY (group_id) REFERENCES groups (id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE group_users
DROP CONSTRAINT IF EXISTS group_users_user_id_fkey;

ALTER TABLE group_users
ADD CONSTRAINT group_users_user_id_fkey FOREIGN KEY (user_id) REFERENCES users (user_id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE groups
DROP CONSTRAINT IF EXISTS groups_group_config_id_fkey;

ALTER TABLE groups
ADD CONSTRAINT groups_group_config_id_fkey FOREIGN KEY (group_config_id) REFERENCES group_configs (id) ON UPDATE CASCADE ON DELETE SET NULL;

DELETE FROM group_configs
WHERE
  deleted_at IS NOT NULL;

DROP INDEX IF EXISTS unique_group_config_per_assessment;

DROP INDEX IF EXISTS group_configs_assessment_id_key;

CREATE UNIQUE INDEX group_configs_assessment_id_key ON group_configs (assessment_id);
