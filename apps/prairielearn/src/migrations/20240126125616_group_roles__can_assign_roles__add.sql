ALTER TABLE group_roles
ADD COLUMN IF NOT EXISTS can_assign_roles BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE group_roles
DROP COLUMN IF EXISTS can_submit_assessment;
