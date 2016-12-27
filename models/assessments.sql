DROP VIEW IF EXISTS assessment_duration_stats;
DROP VIEW IF EXISTS user_assessment_scores;
DROP VIEW IF EXISTS assessment_stats;
DROP VIEW IF EXISTS student_assessment_scores;
DROP MATERIALIZED VIEW IF EXISTS user_assessment_durations;
DROP VIEW IF EXISTS assessment_instance_durations;

CREATE TABLE IF NOT EXISTS assessments (
    id BIGSERIAL PRIMARY KEY,
    uuid UUID NOT NULL UNIQUE,
    tid text,
    course_instance_id BIGINT NOT NULL REFERENCES course_instances ON DELETE CASCADE ON UPDATE CASCADE,
    type enum_assessment_type,
    number text,
    title text,
    config JSONB,
    text TEXT,
    multiple_instance boolean,
    shuffle_questions boolean DEFAULT false,
    max_points DOUBLE PRECISION,
    assessment_set_id BIGINT REFERENCES assessment_sets ON DELETE SET NULL ON UPDATE CASCADE,
    deleted_at TIMESTAMP WITH TIME ZONE,
    obj JSONB
);

-- FIXME: make NOT NULL after upgrade is done
ALTER TABLE assessments ADD COLUMN IF NOT EXISTS uuid UUID UNIQUE;

ALTER TABLE assessments DROP CONSTRAINT IF EXISTS assessments_tid_course_instance_id_key;

ALTER TABLE assessments ALTER COLUMN id SET DATA TYPE BIGINT;
ALTER TABLE assessments ALTER COLUMN course_instance_id SET DATA TYPE BIGINT;
ALTER TABLE assessments ALTER COLUMN assessment_set_id SET DATA TYPE BIGINT;
ALTER TABLE assessments ALTER COLUMN tid SET DATA TYPE TEXT;
ALTER TABLE assessments ALTER COLUMN number SET DATA TYPE TEXT;
ALTER TABLE assessments ALTER COLUMN title SET DATA TYPE TEXT;
