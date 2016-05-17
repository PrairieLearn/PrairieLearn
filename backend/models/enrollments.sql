CREATE TABLE IF NOT EXISTS enrollments (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users,
    course_instance_id INTEGER REFERENCES course_instances,
    role enum_role,
    UNIQUE (user_id, course_instance_id)
);
