CREATE TABLE cron_jobs (
  id bigserial PRIMARY KEY,
  name text NOT NULL UNIQUE,
  date timestamptz NOT NULL
);
