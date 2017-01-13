CREATE TABLE IF NOT EXISTS assessment_questions (
    id BIGSERIAL PRIMARY KEY,
    number INTEGER,
    max_points DOUBLE PRECISION,
    points_list DOUBLE PRECISION[],
    init_points DOUBLE PRECISION,
    assessment_id BIGINT NOT NULL REFERENCES assessments ON DELETE CASCADE ON UPDATE CASCADE,
    alternative_group_id BIGINT REFERENCES alternative_groups ON DELETE SET NULL ON UPDATE CASCADE,
    number_in_alternative_group INTEGER,
    question_id BIGINT NOT NULL REFERENCES questions ON DELETE CASCADE ON UPDATE CASCADE,
    deleted_at TIMESTAMP WITH TIME ZONE,
    UNIQUE (question_id, assessment_id)
);

ALTER TABLE assessment_questions ALTER COLUMN alternative_group_id DROP NOT NULL;
