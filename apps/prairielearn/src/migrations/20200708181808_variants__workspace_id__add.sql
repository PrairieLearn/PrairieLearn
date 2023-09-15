ALTER TABLE workspaces
DROP COLUMN variant_id;

ALTER TABLE variants
ADD COLUMN workspace_id bigint REFERENCES workspaces (id) ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX variants_workspace_id_key ON variants (workspace_id);
