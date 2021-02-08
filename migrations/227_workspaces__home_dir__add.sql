-- Create homedir location with no default, and retroactively set all existing workspaces to be using S3
ALTER TABLE workspaces
ADD COLUMN homedir_location enum_file_storage_type;

UPDATE workspaces
SET homedir_location = 'S3';
