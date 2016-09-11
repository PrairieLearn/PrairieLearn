CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    uid varchar(255) UNIQUE,
    name varchar(255)
);
