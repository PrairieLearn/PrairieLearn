-- Create table and index for group roles. Includes permissions that
-- apply to the assessment instance as a whole.
CREATE TABLE IF NOT EXISTS group_roles (
  id BIGSERIAL PRIMARY KEY,
  role_name TEXT NOT NULL,
  assessment_id BIGINT REFERENCES assessments (id) ON UPDATE CASCADE ON DELETE CASCADE,
  minimum INT DEFAULT 0,
  maximum INT,
  can_assign_roles_at_start BOOLEAN DEFAULT FALSE,
  can_assign_roles_during_assessment BOOLEAN DEFAULT FALSE,
  can_submit_assessment BOOLEAN DEFAULT TRUE
);

CREATE UNIQUE INDEX group_roles_role_name_assessment_id_key ON group_roles (role_name, assessment_id);

-- Create relational table and associated indexes between roles and assessment questions.
-- These specify permissions for individual questions on an assessment.
CREATE TABLE IF NOT EXISTS assessment_question_role_permissions (
  assessment_question_id BIGINT NOT NULL REFERENCES assessment_questions (id) ON UPDATE CASCADE ON DELETE CASCADE,
  group_role_id BIGINT NOT NULL REFERENCES group_roles (id) ON UPDATE CASCADE ON DELETE CASCADE,
  can_view BOOLEAN,
  can_submit BOOLEAN,
  PRIMARY KEY (assessment_question_id, group_role_id)
);

CREATE UNIQUE INDEX assessment_question_role_permissions_assessment_question_id_key ON assessment_question_role_permissions (assessment_question_id, group_role_id);

CREATE INDEX assessment_question_role_permissions_group_role_id_key ON assessment_question_role_permissions (group_role_id);

-- Alter the group user table to include a role
ALTER TABLE group_users
ADD COLUMN IF NOT EXISTS group_role_id BIGINT;

ALTER TABLE group_users
ADD FOREIGN KEY (group_role_id) REFERENCES group_roles (id) ON DELETE CASCADE ON UPDATE CASCADE;
