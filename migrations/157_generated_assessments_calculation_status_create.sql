CREATE TABLE generated_assessments_calculation_status (
    assessment_id BIGINT NOT NULL UNIQUE REFERENCES assessments,
    calculating BOOLEAN
);
