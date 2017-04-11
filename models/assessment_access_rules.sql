CREATE TABLE IF NOT EXISTS assessment_access_rules (
    id BIGSERIAL PRIMARY KEY,
    assessment_id BIGINT NOT NULL REFERENCES assessments ON DELETE CASCADE ON UPDATE CASCADE,
    number INTEGER,
    mode enum_mode,
    role enum_role,
    uids text[],
    start_date TIMESTAMP WITH TIME ZONE,
    end_date TIMESTAMP WITH TIME ZONE,
    credit INTEGER,
    time_limit_min integer,
    UNIQUE (assessment_id, number)
);
