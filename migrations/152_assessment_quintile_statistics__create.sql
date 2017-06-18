CREATE TABLE assessment_quintile_statistics (
    id BIGSERIAL PRIMARY KEY,
    assessment_id BIGINT NOT NULL REFERENCES assessments,

    quintile INTEGER,
    mean_score DOUBLE PRECISION,
    score_sd DOUBLE PRECISION
);
