CREATE TABLE IF NOT EXISTS alternative_groups (
    id BIGSERIAL PRIMARY KEY,
    number INTEGER,
    number_choose INTEGER, -- NULL means choose all
    zone_id BIGINT NOT NULL REFERENCES zones ON DELETE CASCADE ON UPDATE CASCADE,
    assessment_id BIGINT NOT NULL REFERENCES assessments ON DELETE CASCADE ON UPDATE CASCADE,
    UNIQUE (number, assessment_id)
);

ALTER TABLE alternative_groups ALTER COLUMN id SET DATA TYPE BIGINT;
ALTER TABLE alternative_groups ALTER COLUMN zone_id SET DATA TYPE BIGINT;
ALTER TABLE alternative_groups ALTER COLUMN assessment_id SET DATA TYPE BIGINT;
