ALTER TABLE group_roles
DROP COLUMN IF EXISTS can_assign_roles_at_start;

ALTER TABLE group_roles
DROP COLUMN IF EXISTS can_assign_roles_during_assessment;

ALTER TABLE group_roles
DROP COLUMN IF EXISTS can_submit_assessment;
