CREATE TABLE IF NOT EXISTS access_logs (
    id SERIAL PRIMARY KEY,
    mongo_id varchar(255) UNIQUE,
    date timestamp with time zone,
    mode enum_mode,
    ip inet,
    forwarded_ip inet,
    auth_uid varchar(255),
    auth_role enum_role,
    user_uid varchar(255),
    user_role enum_role,
    method varchar(20),
    path varchar(255),
    params jsonb,
    body jsonb
);
