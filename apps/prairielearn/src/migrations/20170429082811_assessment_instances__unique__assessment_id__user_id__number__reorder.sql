ALTER TABLE assessment_instances
DROP CONSTRAINT IF EXISTS assessment_instances_number_assessment_id_user_id_key;

DO $$
BEGIN
    IF NOT EXISTS (
            SELECT 1 FROM information_schema.table_constraints
            WHERE constraint_name = 'assessment_instances_assessment_id_user_id_number_key'
        )
        THEN
        ALTER TABLE assessment_instances ADD UNIQUE (assessment_id, user_id, number);
    END IF;
END;
$$;
