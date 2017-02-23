CREATE TABLE IF NOT EXISTS alternative_groups (
    id BIGSERIAL PRIMARY KEY,
    number INTEGER,
    number_choose INTEGER, -- NULL means choose all
    zone_id BIGINT NOT NULL REFERENCES zones ON DELETE CASCADE ON UPDATE CASCADE,
    assessment_id BIGINT NOT NULL REFERENCES assessments ON DELETE CASCADE ON UPDATE CASCADE,
    UNIQUE (assessment_id, number)
);

ALTER TABLE alternative_groups DROP CONSTRAINT IF EXISTS alternative_groups_number_assessment_id_key;

DO $$
BEGIN
    IF NOT EXISTS (
            SELECT 1 FROM information_schema.table_constraints
            WHERE constraint_name = 'alternative_groups_assessment_id_number_key'
        )
        THEN
        ALTER TABLE alternative_groups ADD UNIQUE (assessment_id, number);
    END IF;
END;
$$
