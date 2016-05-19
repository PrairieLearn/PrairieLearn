CREATE TABLE IF NOT EXISTS semesters (
    id SERIAL PRIMARY KEY,
    short_name varchar(255) UNIQUE,
    long_name varchar(255),
    start_date TIMESTAMP WITH TIME ZONE,
    end_date TIMESTAMP WITH TIME ZONE
);
