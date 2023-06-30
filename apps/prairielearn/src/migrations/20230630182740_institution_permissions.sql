CREATE TYPE enum_institution_role AS ENUM('Admin');

CREATE TABLE IF NOT EXISTS
  institution_permissions (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users (user_id) ON DELETE CASCADE ON UPDATE CASCADE,
    institution_id BIGINT NOT NULL REFERENCES institutions (id) ON DELETE CASCADE ON UPDATE CASCADE,
    institution_role enum_institution_role,
    UNIQUE (user_id, institution_id)
  );
