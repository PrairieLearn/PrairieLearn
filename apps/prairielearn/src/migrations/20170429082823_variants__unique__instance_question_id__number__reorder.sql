ALTER TABLE variants
DROP CONSTRAINT IF EXISTS variants_number_instance_question_id_key;

DO $$
BEGIN
    IF NOT EXISTS (
            SELECT 1 FROM information_schema.table_constraints
            WHERE constraint_name = 'variants_instance_question_id_number_key'
        )
        THEN
        ALTER TABLE variants ADD UNIQUE (instance_question_id, number);
    END IF;
END;
$$;
