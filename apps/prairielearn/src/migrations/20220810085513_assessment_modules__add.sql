CREATE TABLE IF NOT EXISTS assessment_modules (
  id bigserial PRIMARY KEY,
  course_id BIGINT NOT NULL REFERENCES pl_courses (id) ON UPDATE CASCADE ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'Default',
  heading TEXT DEFAULT 'Default module',
  number INTEGER,
  UNIQUE (course_id, name)
);

ALTER TABLE assessments
ADD COLUMN assessment_module_id BIGINT REFERENCES assessment_modules (id) ON UPDATE CASCADE ON DELETE SET NULL;

CREATE TYPE enum_assessment_grouping AS ENUM('Set', 'Module');

ALTER TABLE course_instances
ADD COLUMN assessments_group_by enum_assessment_grouping DEFAULT 'Set' NOT NULL;
