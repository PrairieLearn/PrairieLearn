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
