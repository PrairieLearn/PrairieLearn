CREATE TABLE IF NOT EXISTS zones (
    id SERIAL PRIMARY KEY,
    title varchar(255),
    number INTEGER,
    assessment_id INTEGER NOT NULL REFERENCES assessments ON DELETE CASCADE ON UPDATE CASCADE,
    UNIQUE (number, assessment_id)
);
