CREATE TYPE enum_workspace_homedir_location AS ENUM
    ('s3', 'efs');

ALTER TABLE workspaces
ADD COLUMN homedir_location enum_workspace_homedir_location NOT NULL DEFAULT 's3';
