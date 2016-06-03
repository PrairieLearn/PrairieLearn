CREATE TABLE IF NOT EXISTS zones (
    id SERIAL PRIMARY KEY,
    title varchar(255),
    number INTEGER,
    test_id INTEGER NOT NULL REFERENCES tests ON DELETE CASCADE ON UPDATE CASCADE,
    UNIQUE (number, test_id)
);
