-- BLOCK update_institution_sso_config
WITH deleted_authn_providers AS (
  DELETE FROM institution_authn_providers
  WHERE institution_id = $institution_id
  AND authn_provider_id NOT IN (SELECT unnest($enabled_authn_provider_ids::bigint[]))
), inserted_authn_providers AS (
  INSERT INTO institution_authn_providers (
    institution_id,
    authn_provider_id
  )
  SELECT
    $institution_id AS institution_id,
    unnest($enabled_authn_provider_ids::bigint[]) as authn_provider_id
  ON CONFLICT DO NOTHING
)
UPDATE institutions SET default_authn_provider_id = $default_authn_provider_id
WHERE id = $institution_id;
