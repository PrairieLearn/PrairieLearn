CREATE TABLE query_runs (
  id bigserial PRIMARY KEY,
  date timestamptz NOT NULL DEFAULT now(),
  error text,
  name text NOT NULL,
  sql text NOT NULL,
  params jsonb,
  result jsonb,
  authn_user_id bigint NOT NULL REFERENCES users (user_id) ON DELETE SET NULL ON UPDATE CASCADE
);
