-- Create homedir location with no default, so we can set existing workspaces to use s3
ALTER TABLE workspaces
ADD COLUMN homedir_location enum_file_storage_type;

UPDATE workspaces
SET homedir_location = 'S3';

-- now, set default and not null
ALTER TABLE workspaces ALTER COLUMN homedir_location SET NOT NULL;
ALTER TABLE workspaces ALTER COLUMN homedir_location SET DEFAULT 'FileSystem';
