CREATE TABLE IF NOT EXISTS config (
  id bigserial primary key,
  created_at timestamptz DEFAULT current_timestamp,
  key text UNIQUE NOT NULL,
  value text
);
