-- After backfilling, we still had some `group_users` rows where `group_config_id` was NULL.
-- This is because some `groups` had a NULL `group_config_id`. We'll be fixing that separately,
-- but we'll remove those invalid rows from `group_users` so we can add the constraint.
DELETE FROM group_users
WHERE
  group_config_id IS NULL;

-- Declare `group_users.group_config_id` as NOT NULL, since it is now backfilled.
-- Use the approach described here to avoid a long table lock:
-- https://dba.stackexchange.com/questions/267947/how-can-i-set-a-column-to-not-null-without-locking-the-table-during-a-table-scan/268128#268128
ALTER TABLE group_users
ADD CONSTRAINT group_users_group_config_id_not_null CHECK (group_config_id IS NOT NULL) NOT VALID;

ALTER TABLE group_users VALIDATE CONSTRAINT group_users_group_config_id_not_null;

DO $$
BEGIN
  IF (SELECT convalidated FROM pg_constraint WHERE conname = 'group_users_group_config_id_not_null') THEN
    ALTER TABLE group_users ALTER COLUMN group_config_id SET NOT NULL;

    ALTER TABLE group_users DROP CONSTRAINT group_users_group_config_id_not_null;
  ELSE
    ALTER TABLE group_users DROP CONSTRAINT group_users_group_config_id_not_null;

    RAISE EXCEPTION 'NULL row(s) exist in column, unable to add NOT NULL constraint';
  END IF;
END;
$$;
