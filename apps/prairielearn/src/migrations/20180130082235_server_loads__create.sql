CREATE TABLE server_loads (
  id bigserial PRIMARY KEY,
  date timestamp with time zone NOT NULL DEFAULT now(),
  instance_id text UNIQUE NOT NULL,
  group_name text NOT NULL,
  average_jobs double precision NOT NULL,
  max_jobs double precision NOT NULL
);
