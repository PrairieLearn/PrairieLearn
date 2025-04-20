CREATE TABLE IF NOT EXISTS workspace_hosts (
  id bigserial PRIMARY KEY,
  instance_id text,
  hostname text
);
