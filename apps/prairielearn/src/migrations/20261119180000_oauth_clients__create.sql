-- An agent that connects to PrairieLearn's MCP server. Clients register themselves, so the name
-- is whatever the client claims and is not verified.
CREATE TABLE IF NOT EXISTS oauth_clients (
  id bigserial PRIMARY KEY,
  client_id uuid NOT NULL DEFAULT gen_random_uuid(),
  client_name text NOT NULL,
  redirect_uris text[] NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT oauth_clients_client_id_key UNIQUE (client_id)
);
