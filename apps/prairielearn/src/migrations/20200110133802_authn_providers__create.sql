CREATE TABLE authn_providers (id bigserial PRIMARY KEY, name TEXT);

INSERT INTO
  authn_providers (id, name)
VALUES
  (1, 'Shibboleth'),
  (2, 'Google'),
  (3, 'Azure'),
  (4, 'LTI');

CREATE TABLE institution_authn_providers (
  id bigserial PRIMARY KEY,
  institution_id BIGINT NOT NULL REFERENCES institutions ON DELETE CASCADE ON UPDATE CASCADE,
  authn_provider_id BIGINT NOT NULL REFERENCES authn_providers ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX institution_authn_providers_institution_id_idx ON institution_authn_providers (institution_id);
