CREATE TABLE generated_assessments (
    id BIGSERIAL PRIMARY KEY,
    assessment_id BIGINT NOT NULL REFERENCES assessments,
    generated_aq_ids BIGINT[]
);

CREATE INDEX IF NOT EXISTS generated_assessments_assessment_id ON generated_assessments(assessment_id);
