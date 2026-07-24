-- BLOCK backfill_missing_user_uins
UPDATE users
SET
  uin = 'roster-sync-test-' || id
WHERE
  institution_id = $institution_id
  AND NULLIF(btrim(uin), '') IS NULL;
