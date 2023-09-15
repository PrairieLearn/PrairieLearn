CREATE TYPE enum_file_storage_type AS ENUM('FileSystem', 'S3');

ALTER TABLE files
ADD COLUMN storage_type enum_file_storage_type DEFAULT 'FileSystem'::enum_file_storage_type;
