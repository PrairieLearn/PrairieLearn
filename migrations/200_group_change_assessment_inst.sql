-- one-to-one relationship for each group work assessment
-- group_configs table stores most information including group size and authz defined by the instructor
CREATE TABLE IF NOT EXISTS group_configs (
    id BIGSERIAL PRIMARY KEY,
    course_instance_id BIGINT NOT NULL REFERENCES course_instances(id) ON DELETE CASCADE ON UPDATE CASCADE,
    assessment_id BIGINT REFERENCES assessments(id) ON DELETE CASCADE ON UPDATE CASCADE,
    name TEXT,
    minimum INT,
    maximum INT,
    student_authz_join boolean DEFAULT false,
    student_authz_create boolean DEFAULT false,
    student_authz_leave boolean DEFAULT false,
    date timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    deleted_at timestamp with time zone
);

CREATE INDEX group_configs_course_instance_id_key ON group_configs (course_instance_id);
CREATE INDEX group_configs_assessment_id_key ON group_configs (assessment_id);

-- one-to-many relationship for each group_configs: an assessment with a group_config has many groups
-- groups table only stores id and names
CREATE TABLE IF NOT EXISTS groups (
    id BIGSERIAL PRIMARY KEY,
    course_instance_id BIGINT NOT NULL REFERENCES course_instances(id) ON DELETE CASCADE ON UPDATE CASCADE,
    name TEXT,      -- visible name of the group
    group_config_id BIGINT REFERENCES group_configs(id) ON DELETE CASCADE ON UPDATE CASCADE,
    date timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    deleted_at timestamp with time zone
);

CREATE INDEX groups_course_instance_id_key ON groups (course_instance_id);
CREATE INDEX groups_group_config_id_key ON groups (group_config_id);

-- simple join table, no extra metadata - that could be stored in audit logs if needed
-- one-to-many relationship for each group; this table joins group_id with user_id together
CREATE TABLE IF NOT EXISTS group_users (
    group_id BIGINT REFERENCES groups(id),
    user_id BIGINT REFERENCES users,
    PRIMARY KEY (group_id, user_id)
);

CREATE INDEX group_users_group_id_key ON group_users (group_id);
CREATE INDEX group_users_user_id_key ON group_users (user_id);

-- add needed group work information into previous tables
ALTER TABLE assessments ADD COLUMN group_work boolean DEFAULT FALSE;
ALTER TABLE assessment_instances ADD COLUMN group_id BIGINT REFERENCES groups(id) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE assessment_instances ADD CONSTRAINT assessment_instances_assessment_id_group_id_number_key UNIQUE (assessment_id, group_id, number);
ALTER TABLE assessment_instances ADD CONSTRAINT user_group_XOR CHECK ((user_id IS NOT NULL AND group_id is NULL) OR (group_id IS NOT NULL AND user_id is NULL));
ALTER TABLE assessment_instances ALTER COLUMN user_id DROP NOT NULL;

ALTER TABLE audit_logs ADD COLUMN group_id BIGINT REFERENCES groups ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE variants ADD COLUMN group_id BIGINT REFERENCES groups ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE variants ADD CONSTRAINT user_group_XOR CHECK ((user_id IS NOT NULL AND group_id is NULL) OR (group_id IS NOT NULL AND user_id is NULL));
ALTER TABLE variants ALTER COLUMN user_id DROP NOT NULL;
