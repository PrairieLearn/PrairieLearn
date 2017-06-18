CREATE TABLE generated_assessments (
    id BIGSERIAL PRIMARY KEY,
    assessment_id BIGINT NOT NULL REFERENCES assessments,
    generated_aq_ids BIGINT[]
);