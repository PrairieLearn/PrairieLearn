-- BLOCK get_institution_authn_providers
SELECT *
FROM institution_authn_providers
WHERE institution_id = $institution_id;
