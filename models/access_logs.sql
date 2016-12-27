CREATE TABLE IF NOT EXISTS access_logs (
    id BIGSERIAL PRIMARY KEY,
    mongo_id text UNIQUE,
    date timestamp with time zone,
    mode enum_mode,
    ip inet,
    forwarded_ip inet,
    auth_uid text,
    auth_role enum_role,
    user_uid text,
    user_role enum_role,
    method text,
    path text,
    params jsonb,
    body jsonb
);

ALTER TABLE access_logs ALTER COLUMN id SET DATA TYPE BIGINT;
ALTER TABLE access_logs ALTER COLUMN mongo_id SET DATA TYPE TEXT;
ALTER TABLE access_logs ALTER COLUMN auth_uid SET DATA TYPE TEXT;
ALTER TABLE access_logs ALTER COLUMN user_uid SET DATA TYPE TEXT;
ALTER TABLE access_logs ALTER COLUMN method SET DATA TYPE TEXT;
ALTER TABLE access_logs ALTER COLUMN path SET DATA TYPE TEXT;
