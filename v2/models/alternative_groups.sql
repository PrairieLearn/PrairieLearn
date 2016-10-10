CREATE TABLE IF NOT EXISTS alternative_groups (
    id SERIAL PRIMARY KEY,
    number INTEGER,
    number_choose INTEGER, -- NULL means choose all
    zone_id INTEGER NOT NULL REFERENCES zones ON DELETE CASCADE ON UPDATE CASCADE,
    assessment_id INTEGER NOT NULL REFERENCES assessments ON DELETE CASCADE ON UPDATE CASCADE,
    UNIQUE (number, assessment_id)
);
