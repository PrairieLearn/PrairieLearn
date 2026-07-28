-- BLOCK clear_saml_uin_attribute
UPDATE saml_providers
SET
  uin_attribute = NULL
WHERE
  institution_id = $institution_id;

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
