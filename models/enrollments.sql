CREATE TABLE IF NOT EXISTS enrollments (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users ON DELETE CASCADE ON UPDATE CASCADE,
    course_instance_id BIGINT NOT NULL REFERENCES course_instances ON DELETE CASCADE ON UPDATE CASCADE,
    role enum_role,
    UNIQUE (user_id, course_instance_id), -- allow fast queries by user_id
    UNIQUE (course_instance_id, user_id)  -- allow fast queries by course_instance_id
);

ALTER TABLE enrollments ADD UNIQUE (course_instance_id, user_id);

ALTER TABLE enrollments ALTER COLUMN id SET DATA TYPE BIGINT;
ALTER TABLE enrollments ALTER COLUMN user_id SET DATA TYPE BIGINT;
ALTER TABLE enrollments ALTER COLUMN course_instance_id SET DATA TYPE BIGINT;
