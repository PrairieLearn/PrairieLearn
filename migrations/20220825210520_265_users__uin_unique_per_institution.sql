ALTER TABLE users ADD CONSTRAINT users_uin_institution_id_key UNIQUE (uin, institution_id);
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_uin_key;
