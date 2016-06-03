CREATE TABLE IF NOT EXISTS enrollments (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users ON DELETE CASCADE ON UPDATE CASCADE,
    course_instance_id INTEGER NOT NULL REFERENCES course_instances ON DELETE CASCADE ON UPDATE CASCADE,
    role enum_role,
    UNIQUE (user_id, course_instance_id)
);
