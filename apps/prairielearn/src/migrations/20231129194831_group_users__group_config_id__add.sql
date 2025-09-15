ALTER TABLE group_users
-- squawk-ignore adding-foreign-key-constraint
ADD COLUMN IF NOT EXISTS group_config_id BIGINT REFERENCES group_configs (id) ON UPDATE CASCADE ON DELETE CASCADE;
