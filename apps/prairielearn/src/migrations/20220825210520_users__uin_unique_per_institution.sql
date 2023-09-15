CREATE UNIQUE INDEX IF NOT EXISTS users_uin_institution_id_key ON users (uin, institution_id);

ALTER TABLE users
DROP CONSTRAINT IF EXISTS users_uin_key;
