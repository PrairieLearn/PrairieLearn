-- BLOCK backfill_missing_user_uins
UPDATE users
SET
  uin = 'roster-sync-test-' || id
WHERE
  institution_id = $institution_id
  AND NULLIF(btrim(uin), '') IS NULL;

-- BLOCK insert_unnamed_authn_provider
WITH
  reset_sequence AS (
    SELECT
      setval('authn_providers_id_seq', max(id))
    FROM
      authn_providers
  )
INSERT INTO
  authn_providers (name)
SELECT
  NULL
FROM
  reset_sequence
RETURNING
  id;
