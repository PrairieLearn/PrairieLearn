CREATE TABLE theme (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users ON DELETE CASCADE ON UPDATE CASCADE,
    themenum bigint not null default 0
);