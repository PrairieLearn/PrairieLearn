CREATE TABLE IF NOT EXISTS zones (
    id BIGSERIAL PRIMARY KEY,
    title text,
    number INTEGER,
    number_choose INTEGER, -- NULL means choose all
    assessment_id BIGINT NOT NULL REFERENCES assessments ON DELETE CASCADE ON UPDATE CASCADE,
    UNIQUE (number, assessment_id)
);
