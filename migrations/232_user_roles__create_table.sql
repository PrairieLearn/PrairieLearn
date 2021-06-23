CREATE TYPE enum_pogil_role AS ENUM ('None', 'Manager', 'Recorder', 'Reflector', 'Contributor');

CREATE TABLE IF NOT EXISTS user_roles (
    group_id BIGINT REFERENCES groups(id),
    user_id BIGINT REFERENCES users,
    pogil_role enum_pogil_role DEFAULT 'None',
    PRIMARY KEY (group_id, user_id, pogil_role)
);

CREATE INDEX user_roles_group_id_key ON user_roles (group_id);
CREATE INDEX user_roles_user_id_key ON user_roles (user_id);