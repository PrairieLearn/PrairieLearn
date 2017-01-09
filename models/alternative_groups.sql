CREATE TABLE IF NOT EXISTS alternative_groups (
    id BIGSERIAL PRIMARY KEY,
    number INTEGER,
    number_choose INTEGER, -- NULL means choose all
    zone_id BIGINT NOT NULL REFERENCES zones ON DELETE CASCADE ON UPDATE CASCADE,
    assessment_id BIGINT NOT NULL REFERENCES assessments ON DELETE CASCADE ON UPDATE CASCADE,
    UNIQUE (number, assessment_id)
);
