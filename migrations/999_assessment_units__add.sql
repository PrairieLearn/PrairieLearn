CREATE TABLE IF NOT EXISTS assessment_units (
    id bigserial PRIMARY KEY,
    course_instance_id BIGINT NOT NULL REFERENCES course_instances(id) ON DELETE CASCADE ON UPDATE CASCADE,
    name TEXT NOT NULL DEFAULT 'Default',
    heading TEXT DEFAULT 'Default unit',
    number INTEGER
);

ALTER TABLE assessments ADD COLUMN unit_id BIGINT REFERENCES assessment_units(id);

CREATE TYPE assessment_grouping AS ENUM ('set', 'unit');
ALTER TABLE pl_courses ADD COLUMN assessments_group_by assessment_grouping DEFAULT 'set' NOT NULL;