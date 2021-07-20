CREATE TABLE IF NOT EXISTS assessment_units (
    id bigserial PRIMARY KEY,
    course_id BIGINT NOT NULL REFERENCES pl_courses(id) ON UPDATE CASCADE ON DELETE CASCADE,
    name TEXT NOT NULL DEFAULT 'Default',
    heading TEXT DEFAULT 'Default unit',
    number INTEGER,
    UNIQUE(course_id, name)
);

ALTER TABLE assessments ADD COLUMN assessment_unit_id BIGINT REFERENCES assessment_units(id) ON UPDATE CASCADE ON DELETE SET NULL;

CREATE TYPE enum_assessment_grouping AS ENUM ('set', 'unit');
ALTER TABLE pl_courses ADD COLUMN assessments_group_by enum_assessment_grouping DEFAULT 'set' NOT NULL;