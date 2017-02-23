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

ALTER TABLE assessment_access_rules ADD COLUMN IF NOT EXISTS time_limit_min integer;

ALTER TABLE assessment_access_rules DROP CONSTRAINT IF EXISTS assessment_access_rules_number_assessment_id_key;

DO $$
BEGIN
    IF NOT EXISTS (
            SELECT 1 FROM information_schema.table_constraints
            WHERE constraint_name = 'assessment_access_rules_assessment_id_number_key'
        )
        THEN
        ALTER TABLE assessment_access_rules ADD UNIQUE (assessment_id, number);
    END IF;
END;
$$
