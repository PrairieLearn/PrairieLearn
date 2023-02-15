ALTER TABLE alternative_groups
DROP CONSTRAINT IF EXISTS alternative_groups_number_assessment_id_key;

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
$$;
