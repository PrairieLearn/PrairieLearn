ALTER TABLE users
ADD COLUMN institution_id BIGINT NOT NULL DEFAULT 1 REFERENCES institutions (id) ON UPDATE CASCADE ON DELETE SET NULL;

ALTER TABLE users
DROP COLUMN provider;

CREATE INDEX users_institution_id_key ON users (institution_id);
