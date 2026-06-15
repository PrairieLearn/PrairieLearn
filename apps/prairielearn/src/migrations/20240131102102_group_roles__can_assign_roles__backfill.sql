-- This is done with a regular migration instead of a batched migration because the number of rows in production is small.
UPDATE group_roles
SET
  can_assign_roles = can_assign_roles_at_start;
