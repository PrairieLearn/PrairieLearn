ALTER TABLE workspaces ADD COLUMN launching_duration INTERVAL DEFAULT '0 seconds';
ALTER TABLE workspaces ADD COLUMN running_duration INTERVAL DEFAULT '0 seconds';
CREATE INDEX workspaces_created_at_key ON workspaces (created_at);
