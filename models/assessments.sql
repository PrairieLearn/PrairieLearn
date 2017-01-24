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
    allow_review boolean DEFAULT false,
    max_points DOUBLE PRECISION,
    assessment_set_id BIGINT REFERENCES assessment_sets ON DELETE SET NULL ON UPDATE CASCADE,
    deleted_at TIMESTAMP WITH TIME ZONE,
    obj JSONB
);

ALTER TABLE assessments ADD COLUMN IF NOT EXISTS order_by integer;
ALTER TABLE assessments ADD COLUMN IF NOT EXISTS auto_close boolean DEFAULT true;
ALTER TABLE assessments ADD COLUMN IF NOT EXISTS allow_review boolean DEFAULT true;
