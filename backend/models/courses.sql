CREATE TABLE IF NOT EXISTS courses (
    id SERIAL PRIMARY KEY,
    short_name varchar(255) UNIQUE,
    title varchar(255)
);
