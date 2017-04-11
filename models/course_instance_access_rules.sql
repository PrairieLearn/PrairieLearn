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
