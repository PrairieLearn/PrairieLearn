CREATE TABLE IF NOT EXISTS assessments (
    id BIGSERIAL PRIMARY KEY,
    uuid UUID NOT NULL UNIQUE,
    tid text,
    course_instance_id BIGINT NOT NULL REFERENCES course_instances ON DELETE CASCADE ON UPDATE CASCADE,
    type enum_assessment_type,
    number text,
    order_by integer,
    title text,
    config JSONB,
    text TEXT,
    multiple_instance boolean,
    shuffle_questions boolean DEFAULT false,
    auto_close boolean DEFAULT true,
    max_points DOUBLE PRECISION,
    assessment_set_id BIGINT REFERENCES assessment_sets ON DELETE SET NULL ON UPDATE CASCADE,
    deleted_at TIMESTAMP WITH TIME ZONE,
    obj JSONB
);

CREATE INDEX IF NOT EXISTS assessments_course_instance_id_idx ON assessments (course_instance_id);
CREATE INDEX IF NOT EXISTS assessments_assessment_set_id_idx ON assessments (assessment_set_id);

ALTER TABLE assessments ADD COLUMN IF NOT EXISTS order_by integer;
ALTER TABLE assessments ADD COLUMN IF NOT EXISTS auto_close boolean DEFAULT true;
