ALTER TABLE course_instance_access_rules
DROP CONSTRAINT IF EXISTS course_instance_access_rules_number_course_instance_id_key;

DO $$
BEGIN
    IF NOT EXISTS (
            SELECT 1 FROM information_schema.table_constraints
            WHERE constraint_name = 'course_instance_access_rules_course_instance_id_number_key'
        )
        THEN
        ALTER TABLE course_instance_access_rules ADD UNIQUE (course_instance_id, number);
    END IF;
END;
$$;
