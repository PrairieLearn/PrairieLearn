CREATE TABLE IF NOT EXISTS zones (
    id SERIAL PRIMARY KEY,
    title varchar(255),
    number INTEGER,
    test_id INTEGER REFERENCES tests
);
