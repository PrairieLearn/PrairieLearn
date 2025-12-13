-- This is a synchronous migration that renames the `groups` table to `teams`.
-- We typically don't do this, but in this case, we will do it during a downtime window.
ALTER TABLE IF EXISTS groups
RENAME TO teams;

ALTER SEQUENCE IF EXISTS groups_id_seq
RENAME TO teams_id_seq;

ALTER TABLE IF EXISTS teams
RENAME COLUMN group_config_id TO team_config_id;

ALTER INDEX IF EXISTS unique_group_name
RENAME TO unique_team_name;

ALTER INDEX IF EXISTS groups_pkey
RENAME TO teams_pkey;

ALTER INDEX IF EXISTS groups_course_instance_id_key
RENAME TO teams_course_instance_id_key;

ALTER INDEX IF EXISTS groups_group_config_id_key
RENAME TO teams_team_config_id_key;

ALTER TABLE teams
RENAME CONSTRAINT groups_course_instance_id_fkey TO teams_course_instance_id_fkey;

ALTER TABLE teams
RENAME CONSTRAINT groups_group_config_id_fkey TO teams_team_config_id_fkey;

ALTER TABLE IF EXISTS group_configs
RENAME TO team_configs;

ALTER SEQUENCE IF EXISTS group_configs_id_seq
RENAME TO team_configs_id_seq;

ALTER INDEX IF EXISTS group_configs_pkey
RENAME TO team_configs_pkey;

ALTER INDEX IF EXISTS group_configs_assessment_id_key
RENAME TO team_configs_assessment_id_key;

ALTER INDEX IF EXISTS group_configs_course_instance_id_key
RENAME TO team_configs_course_instance_id_key;

ALTER TABLE team_configs
RENAME CONSTRAINT group_configs_assessment_id_fkey TO team_configs_assessment_id_fkey;

ALTER TABLE team_configs
RENAME CONSTRAINT group_configs_course_instance_id_fkey TO team_configs_course_instance_id_fkey;

ALTER TABLE IF EXISTS group_users
RENAME TO team_users;

ALTER TABLE IF EXISTS team_users
RENAME COLUMN group_config_id TO team_config_id;

ALTER TABLE IF EXISTS team_users
RENAME COLUMN group_id TO team_id;

ALTER INDEX IF EXISTS group_users_pkey
RENAME TO team_users_pkey;

ALTER INDEX IF EXISTS group_users_user_id_group_config_id_key
RENAME TO team_users_user_id_team_config_id_key;

ALTER TABLE team_users
RENAME CONSTRAINT group_users_group_config_id_fkey TO team_users_team_config_id_fkey;

ALTER TABLE team_users
RENAME CONSTRAINT group_users_group_id_fkey TO team_users_team_id_fkey;

ALTER TABLE team_users
RENAME CONSTRAINT group_users_user_id_fkey TO team_users_user_id_fkey;

ALTER TABLE IF EXISTS group_roles
RENAME TO team_roles;

ALTER SEQUENCE IF EXISTS group_roles_id_seq
RENAME TO team_roles_id_seq;

ALTER INDEX IF EXISTS group_roles_pkey
RENAME TO team_roles_pkey;

ALTER INDEX IF EXISTS group_roles_role_name_assessment_id_key
RENAME TO team_roles_role_name_assessment_id_key;

ALTER TABLE team_roles
RENAME CONSTRAINT group_roles_assessment_id_fkey TO team_roles_assessment_id_fkey;

ALTER TABLE IF EXISTS group_user_roles
RENAME TO team_user_roles;

ALTER SEQUENCE IF EXISTS group_user_roles_id_seq
RENAME TO team_user_roles_id_seq;

ALTER TABLE IF EXISTS team_user_roles
RENAME COLUMN group_id TO team_id;

ALTER TABLE IF EXISTS team_user_roles
RENAME COLUMN group_role_id TO team_role_id;

ALTER INDEX IF EXISTS group_user_roles_pkey
RENAME TO team_user_roles_pkey;

ALTER INDEX IF EXISTS group_user_roles_group_id_user_id_group_role_id_key
RENAME TO team_user_roles_team_id_user_id_team_role_id_key;

ALTER TABLE team_user_roles
RENAME CONSTRAINT group_user_roles_group_id_fkey TO team_user_roles_team_id_fkey;

ALTER TABLE team_user_roles
RENAME CONSTRAINT group_user_roles_group_id_user_id_fkey TO team_user_roles_team_id_user_id_fkey;

ALTER TABLE team_user_roles
RENAME CONSTRAINT group_user_roles_group_role_id_fkey TO team_user_roles_team_role_id_fkey;

ALTER TABLE team_user_roles
RENAME CONSTRAINT group_user_roles_user_id_fkey TO team_user_roles_user_id_fkey;

ALTER TABLE IF EXISTS group_logs
RENAME TO team_logs;

ALTER SEQUENCE IF EXISTS group_logs_id_seq
RENAME TO team_logs_id_seq;

ALTER TABLE IF EXISTS team_logs
RENAME COLUMN group_id TO team_id;

ALTER INDEX IF EXISTS group_logs_pkey
RENAME TO team_logs_pkey;

ALTER INDEX IF EXISTS group_logs_group_id_idx
RENAME TO team_logs_team_id_idx;

ALTER INDEX IF EXISTS group_logs_user_id_idx
RENAME TO team_logs_user_id_idx;

ALTER TABLE IF EXISTS last_accesses
RENAME COLUMN group_id TO team_id;

ALTER TABLE last_accesses
RENAME CONSTRAINT user_group_xor TO user_team_xor;

ALTER INDEX IF EXISTS last_accesses_group_id_key
RENAME TO last_accesses_team_id_key;

ALTER TABLE last_accesses
RENAME CONSTRAINT last_accesses_group_id_fkey TO last_accesses_team_id_fkey;

ALTER TABLE IF EXISTS audit_events
RENAME COLUMN group_id TO team_id;

ALTER TABLE audit_events
RENAME CONSTRAINT audit_events_group_id_fkey TO audit_events_team_id_fkey;

ALTER TABLE IF EXISTS audit_logs
RENAME COLUMN group_id TO team_id;

ALTER TABLE IF EXISTS assessments
RENAME COLUMN group_work TO team_work;

ALTER TABLE IF EXISTS assessment_instances
RENAME COLUMN group_id TO team_id;

ALTER TABLE assessment_instances
RENAME CONSTRAINT user_group_xor TO user_team_xor;

ALTER TABLE assessment_instances
RENAME CONSTRAINT assessment_instances_group_id_fkey TO assessment_instances_team_id_fkey;

ALTER INDEX IF EXISTS assessment_instances_assessment_id_group_id_number_key
RENAME TO assessment_instances_assessment_id_team_id_number_key;

ALTER TABLE IF EXISTS variants
RENAME COLUMN group_id TO team_id;

ALTER TABLE variants
RENAME CONSTRAINT user_group_xor TO user_team_xor;

ALTER TABLE variants
RENAME CONSTRAINT variants_group_id_fkey TO variants_team_id_fkey;

ALTER TABLE IF EXISTS assessment_question_role_permissions
RENAME COLUMN group_role_id TO team_role_id;

ALTER INDEX IF EXISTS assessment_question_role_permissions_group_role_id_key
RENAME TO assessment_question_role_permissions_team_role_id_key;

ALTER TABLE assessment_question_role_permissions
RENAME CONSTRAINT assessment_question_role_permissions_group_role_id_fkey TO assessment_question_role_permissions_team_role_id_fkey;
