CREATE TABLE access_tokens (
    id bigserial PRIMARY KEY,
    created_at timestamp with time zone NOT NULL DEFAULT NOW(),
    user_id BIGINT NOT NULL REFERENCES users ON DELETE CASCADE ON UPDATE CASCADE,
    name TEXT NOT NULL,
    token_hash TEXT UNIQUE NOT NULL
)