CREATE TABLE IF NOT EXISTS course_instance_access_rules (
    id SERIAL PRIMARY KEY,
    course_instance_id INTEGER NOT NULL REFERENCES course_instances ON DELETE CASCADE ON UPDATE CASCADE,
    number INTEGER,
    role enum_role,
    uids varchar(255)[],
    start_date TIMESTAMP WITH TIME ZONE,
    end_date TIMESTAMP WITH TIME ZONE,
    UNIQUE (number, course_instance_id)
);
