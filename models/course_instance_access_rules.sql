CREATE TABLE IF NOT EXISTS course_instance_access_rules (
    id BIGSERIAL PRIMARY KEY,
    course_instance_id BIGINT NOT NULL REFERENCES course_instances ON DELETE CASCADE ON UPDATE CASCADE,
    number INTEGER,
    role enum_role,
    uids text[],
    start_date TIMESTAMP WITH TIME ZONE,
    end_date TIMESTAMP WITH TIME ZONE,
    UNIQUE (course_instance_id, number)
);

ALTER TABLE course_instance_access_rules DROP CONSTRAINT IF EXISTS course_instance_access_rules_number_course_instance_id_key;

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
$$
