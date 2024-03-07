ALTER TABLE zones
DROP CONSTRAINT IF EXISTS zones_number_assessment_id_key;

DO $$
BEGIN
    IF NOT EXISTS (
            SELECT 1 FROM information_schema.table_constraints
            WHERE constraint_name = 'zones_assessment_id_number_key'
        )
        THEN
        ALTER TABLE zones ADD UNIQUE (assessment_id, number);
    END IF;
END;
$$;
