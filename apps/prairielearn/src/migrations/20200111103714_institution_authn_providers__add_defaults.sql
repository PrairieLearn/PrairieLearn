ALTER TABLE institution_authn_providers
ADD UNIQUE (institution_id, authn_provider_id);

DROP INDEX institution_authn_providers_institution_id_idx;

INSERT INTO
  institution_authn_providers (institution_id, authn_provider_id)
VALUES
  (1, 1),
  (1, 2),
  (1, 3),
  (2, 4)
ON CONFLICT DO NOTHING;
