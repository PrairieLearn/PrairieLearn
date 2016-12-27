CREATE TABLE IF NOT EXISTS assessments (
    id SERIAL PRIMARY KEY,
    uuid UUID NOT NULL UNIQUE,
    tid varchar(255),
    course_instance_id INTEGER NOT NULL REFERENCES course_instances ON DELETE CASCADE ON UPDATE CASCADE,
    type enum_assessment_type,
    number varchar(20),
    title varchar(255),
    config JSONB,
    text TEXT,
    multiple_instance boolean,
    shuffle_questions boolean DEFAULT false,
    max_points DOUBLE PRECISION,
    assessment_set_id INTEGER REFERENCES assessment_sets ON DELETE SET NULL ON UPDATE CASCADE,
    deleted_at TIMESTAMP WITH TIME ZONE,
    obj JSONB
);

-- FIXME: make NOT NULL after upgrade is done
ALTER TABLE assessments ADD COLUMN IF NOT EXISTS uuid UUID UNIQUE;

ALTER TABLE assessments DROP CONSTRAINT IF EXISTS assessments_tid_course_instance_id_key;
