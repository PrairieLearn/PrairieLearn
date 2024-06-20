-- For whatever reason, we ended up with rows in the `groups` table where
-- `group_config_id` was NULL. This is invalid, since `groups` rows aren't
-- reachable via our joins with such a value defined. So that we can mark
-- this column as NOT NULL, we'll delete those rows.
DELETE FROM groups
WHERE
  group_config_id IS NULL;

-- Declare `groups.group_config_id` as NOT NULL, since it is now backfilled.
-- Use the approach described here to avoid a long table lock:
-- https://dba.stackexchange.com/questions/267947/how-can-i-set-a-column-to-not-null-without-locking-the-table-during-a-table-scan/268128#268128
ALTER TABLE groups
ADD CONSTRAINT groups_group_config_id_not_null CHECK (group_config_id IS NOT NULL) NOT VALID;

ALTER TABLE groups VALIDATE CONSTRAINT groups_group_config_id_not_null;

DO $$
BEGIN
  IF (SELECT convalidated FROM pg_constraint WHERE conname = 'groups_group_config_id_not_null') THEN
    ALTER TABLE groups ALTER COLUMN group_config_id SET NOT NULL;

    ALTER TABLE groups DROP CONSTRAINT groups_group_config_id_not_null;
  ELSE
    ALTER TABLE groups DROP CONSTRAINT groups_group_config_id_not_null;

    RAISE EXCEPTION 'NULL row(s) exist in column, unable to add NOT NULL constraint';
  END IF;
END;
$$;
