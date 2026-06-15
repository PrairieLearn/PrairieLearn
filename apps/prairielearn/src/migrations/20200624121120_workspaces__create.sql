CREATE TYPE enum_workspace_state AS ENUM(
  'uninitialized',
  'stopped',
  'launching',
  'running'
);

CREATE TABLE IF NOT EXISTS workspaces (
  id bigserial PRIMARY KEY,
  s3_bucket text,
  s3_root_key text,
  state enum_workspace_state DEFAULT 'uninitialized',
  variant_id bigint REFERENCES variants (id) ON DELETE CASCADE ON UPDATE CASCADE,
  workspace_host_id bigint REFERENCES workspace_hosts (id) ON DELETE CASCADE ON UPDATE CASCADE
);
