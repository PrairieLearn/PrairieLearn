CREATE TABLE IF NOT EXISTS assessment_access_rules (
    id SERIAL PRIMARY KEY,
    assessment_id INTEGER NOT NULL REFERENCES assessments ON DELETE CASCADE ON UPDATE CASCADE,
    number INTEGER,
    mode enum_mode,
    role enum_role,
    uids varchar(255)[],
    start_date TIMESTAMP WITH TIME ZONE,
    end_date TIMESTAMP WITH TIME ZONE,
    credit INTEGER,
    UNIQUE (number, assessment_id)
);
