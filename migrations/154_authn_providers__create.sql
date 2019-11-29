CREATE TABLE authn_providers (
    id bigserial PRIMARY KEY,
    name TEXT
);

INSERT INTO authn_providers (id, name) VALUES (1, 'Shibboleth'), (2, 'Google'), (3, 'Azure');

CREATE TABLE institution_authn_providers (
    id bigserial PRIMARY KEY,
    institution_id BIGINT NOT NULL REFERENCES institutions ON DELETE CASCADE ON UPDATE CASCADE,
    authn_provider_id BIGINT NOT NULL REFERENCES authn_provider_id ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX institution_authn_providers_institution_id_idx ON institution_authn_providers (institution_id);

INSERT INTO institution_authn_providers (institution_id, authn_provider_id) VALUES (1, 1), (1, 2), (1, 3);
