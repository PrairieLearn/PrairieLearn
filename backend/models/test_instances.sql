CREATE TABLE IF NOT EXISTS test_instances (
    id SERIAL PRIMARY KEY,
    tiid varchar(255) UNIQUE, -- temporary, delete after Mongo import
    qids JSONB, -- temporary, delete after Mongo import
    obj JSONB, -- temporary, delete after Mongo import
    date TIMESTAMP WITH TIME ZONE,
    number INTEGER,
    test_id INTEGER NOT NULL REFERENCES tests ON DELETE CASCADE ON UPDATE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users ON DELETE CASCADE ON UPDATE CASCADE,
    auth_user_id INTEGER NOT NULL REFERENCES users ON DELETE CASCADE ON UPDATE CASCADE,
    UNIQUE (number, test_id, user_id)
);
