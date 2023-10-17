ALTER TABLE workspaces
ADD COLUMN launching_duration INTERVAL DEFAULT '0 seconds';

ALTER TABLE workspaces
ADD COLUMN running_duration INTERVAL DEFAULT '0 seconds';
