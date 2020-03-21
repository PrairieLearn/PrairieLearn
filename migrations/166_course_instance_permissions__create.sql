CREATE TYPE enum_course_instance_role AS ENUM ('None', 'Student Data Viewer', 'Student Data Editor');

CREATE TABLE course_instance_permissions (
    id BIGSERIAL PRIMARY KEY,
    course_instance_id BIGINT NOT NULL REFERENCES course_instances ON DELETE CASCADE ON UPDATE CASCADE,
    course_instance_role enum_course_instance_role,
    course_permission_id BIGINT NOT NULL REFERENCES course_permissions ON DELETE CASCADE ON UPDATE CASCADE,
    UNIQUE (course_permission_id, course_instance_id)
);

CREATE INDEX course_instance_permissions_course_instance_id_idx ON course_instance_permissions (course_instance_id);
