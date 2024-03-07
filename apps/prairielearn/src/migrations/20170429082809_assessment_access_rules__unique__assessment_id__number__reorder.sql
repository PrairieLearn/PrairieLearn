ALTER TABLE assessment_access_rules
DROP CONSTRAINT IF EXISTS assessment_access_rules_number_assessment_id_key;

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
$$;
