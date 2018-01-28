CREATE TABLE named_locks (
    id bigserial PRIMARY KEY,
    name text NOT NULL UNIQUE
);
