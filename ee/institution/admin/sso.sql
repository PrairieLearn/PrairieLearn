-- BLOCK update_institution_sso_config
WITH deleted_authn_providers AS (
  DELETE FROM institution_authn_providers
  WHERE institution_id = $institution_id
  AND authn_provider_id NOT IN (SELECT unnest($enabled_authn_provider_ids::bigint[]))
  RETURNING *
), inserted_authn_providers AS (
  INSERT INTO institution_authn_providers (
    institution_id,
    authn_provider_id
  )
  SELECT
    $institution_id AS institution_id,
    unnest($enabled_authn_provider_ids::bigint[]) as authn_provider_id
  ON CONFLICT DO NOTHING
  RETURNING *
), updated_default_authn_provider AS (
  UPDATE institutions
  SET default_authn_provider_id = $default_authn_provider_id
  WHERE id = $institution_id
  RETURNING *
), audit_logs_deleted_authn_providers AS (
  INSERT INTO audit_logs (
    authn_user_id,
    table_name,
    action,
    institution_id,
    row_id,
    old_state
  )
  SELECT
    $authn_user_id AS authn_user_id,
    'institution_authn_providers' AS table_name,
    'delete' AS action,
    dap.institution_id,
    dap.id AS row_id,
    to_jsonb(dap.*) AS old_state
  FROM
    deleted_authn_providers AS dap
), audit_logs_inserted_authn_providers AS (
  INSERT INTO audit_logs (
    authn_user_id,
    table_name,
    action,
    institution_id,
    row_id,
    new_state
  )
  SELECT
    $authn_user_id AS authn_user_id,
    'institution_authn_providers' AS table_name,
    'insert' AS action,
    iap.institution_id,
    iap.id AS row_id,
    to_jsonb(iap.*) AS new_state
  FROM
    inserted_authn_providers AS iap
), audit_logs_updated_default_authn_provider AS (
  INSERT INTO audit_logs (
    authn_user_id,
    table_name,
    action,
    institution_id,
    row_id,
    new_state
  )
  SELECT
    $authn_user_id AS authn_user_id,
    'institutions' AS table_name,
    'update' AS action,
    udap.id AS institution_id,
    udap.id AS row_id,
    jsonb_build_object(
      'default_authn_provider_id',
      udap.default_authn_provider_id,
      'default_authn_provider_name',
      ap.name
    ) AS new_state
  FROM
    updated_default_authn_provider AS udap
    LEFT JOIN authn_providers AS ap ON (ap.id = default_authn_provider_id)
) SELECT 1;
