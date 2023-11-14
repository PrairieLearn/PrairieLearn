INSERT INTO
  authn_providers (id, name)
VALUES
  (6, 'OID')
ON CONFLICT DO NOTHING;

INSERT INTO
  institution_authn_providers (id, institution_id, authn_provider_id)
VALUES
  (6, 1, 6)
ON CONFLICT DO NOTHING;
