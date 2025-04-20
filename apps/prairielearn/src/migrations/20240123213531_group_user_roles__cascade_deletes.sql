-- Add new constraints that include cascading updates and deletes
ALTER TABLE group_user_roles
ADD CONSTRAINT group_user_roles_group_id_new_fkey FOREIGN KEY (group_id) REFERENCES groups (id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE group_user_roles
ADD CONSTRAINT group_user_roles_group_role_id_new_fkey FOREIGN KEY (group_role_id) REFERENCES group_roles (id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE group_user_roles
ADD CONSTRAINT group_user_roles_user_id_new_fkey FOREIGN KEY (user_id) REFERENCES users (user_id) ON UPDATE CASCADE ON DELETE CASCADE;

-- Drop the old constraints.
ALTER TABLE group_user_roles
DROP CONSTRAINT IF EXISTS group_user_roles_group_id_fkey;

ALTER TABLE group_user_roles
DROP CONSTRAINT IF EXISTS group_user_roles_group_role_id_fkey;

ALTER TABLE group_user_roles
DROP CONSTRAINT IF EXISTS group_user_roles_user_id_fkey;

-- Rename the new constraints to the old names.
ALTER TABLE group_user_roles
RENAME CONSTRAINT group_user_roles_group_id_new_fkey TO group_user_roles_group_id_fkey;

ALTER TABLE group_user_roles
RENAME CONSTRAINT group_user_roles_group_role_id_new_fkey TO group_user_roles_group_role_id_fkey;

ALTER TABLE group_user_roles
RENAME CONSTRAINT group_user_roles_user_id_new_fkey TO group_user_roles_user_id_fkey;
