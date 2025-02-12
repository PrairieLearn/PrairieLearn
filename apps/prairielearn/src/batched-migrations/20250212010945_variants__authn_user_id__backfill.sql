-- BLOCK backfill_authn_user_id
UPDATE variants
SET
  authn_user_id = user_id
WHERE
  authn_user_id IS NULL
  AND id >= $start
  AND id <= $end;
