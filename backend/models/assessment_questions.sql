CREATE TABLE IF NOT EXISTS assessment_questions (
    id SERIAL PRIMARY KEY,
    number INTEGER,
    max_points DOUBLE PRECISION,
    points_list DOUBLE PRECISION[],
    init_points DOUBLE PRECISION,
    assessment_id INTEGER NOT NULL REFERENCES assessments ON DELETE CASCADE ON UPDATE CASCADE,
    zone_id INTEGER REFERENCES zones ON DELETE SET NULL ON UPDATE CASCADE,
    question_id INTEGER NOT NULL REFERENCES questions ON DELETE CASCADE ON UPDATE CASCADE,
    deleted_at TIMESTAMP WITH TIME ZONE,
    UNIQUE (question_id, assessment_id)
);
