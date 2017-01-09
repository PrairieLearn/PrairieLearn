CREATE TABLE IF NOT EXISTS users (
    user_id BIGSERIAL PRIMARY KEY,
    uid text UNIQUE NOT NULL,
    uin char(9) UNIQUE,
    name text
);
