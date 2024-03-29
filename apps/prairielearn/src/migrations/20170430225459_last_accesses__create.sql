CREATE TABLE IF NOT EXISTS last_accesses (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT UNIQUE NOT NULL REFERENCES users ON DELETE CASCADE ON UPDATE CASCADE,
  last_access TIMESTAMPTZ
);
