CREATE TABLE IF NOT EXISTS rubrics (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    starting_points DOUBLE PRECISION NOT NULL,
    max_points DOUBLE PRECISION NOT NULL,
    min_points DOUBLE PRECISION NOT NULL,
    deleted_at TIMESTAMP WITH TIME ZONE
);

CREATE TABLE IF NOT EXISTS rubric_items (
    id BIGSERIAL PRIMARY KEY,
    rubric_id BIGINT NOT NULL REFERENCES rubrics(id) ON DELETE CASCADE ON UPDATE CASCADE,
    number BIGINT NOT NULL,
    points DOUBLE PRECISION NOT NULL,
    short_text TEXT,
    description TEXT,
    staff_instructions TEXT,
    key_binding TEXT,
    deleted_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS rubric_items_rubric_id ON rubric_items(rubric_id);

CREATE TABLE IF NOT EXISTS instance_question_rubric_items (
    id BIGSERIAL PRIMARY KEY,
    instance_question_id BIGINT NOT NULL REFERENCES instance_questions(id) ON DELETE CASCADE ON UPDATE CASCADE,
    manual BOOLEAN NOT NULL,
    rubric_item_id BIGINT NOT NULL REFERENCES rubric_items(id) ON DELETE CASCADE ON UPDATE CASCADE,
    points DOUBLE PRECISION NOT NULL,
    note TEXT,
    deleted_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS instance_question_rubric_items_rubric_item_id ON instance_question_rubric_items(rubric_item_id);

ALTER TABLE instance_question_rubric_items ADD CONSTRAINT instance_question_rubric_items_instance_question_id_rubric_item_id_key UNIQUE (instance_question_id, rubric_item_id);

ALTER TABLE instance_questions ADD COLUMN IF NOT EXISTS manual_adjust_points DOUBLE PRECISION;

ALTER TABLE assessment_questions ADD COLUMN IF NOT EXISTS manual_rubric_id BIGINT REFERENCES rubrics(id) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE assessment_questions ADD COLUMN IF NOT EXISTS auto_rubric_id BIGINT REFERENCES rubrics(id) ON DELETE SET NULL ON UPDATE CASCADE;

