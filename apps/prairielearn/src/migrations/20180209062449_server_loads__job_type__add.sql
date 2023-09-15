ALTER TABLE server_loads
ADD COLUMN job_type text;

UPDATE server_loads
SET
  job_type = 'authed_request';

ALTER TABLE server_loads
ALTER COLUMN job_type
SET NOT NULL;

ALTER TABLE server_loads
DROP CONSTRAINT server_loads_instance_id_key;

ALTER TABLE server_loads
ADD UNIQUE (instance_id, job_type);
