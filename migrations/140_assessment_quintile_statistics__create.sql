CREATE TABLE assessment_quintile_statistics (
    id BIGSERIAL PRIMARY KEY,
    assessment_id BIGINT NOT NULL REFERENCES assessments,

    quintile INTEGER,
    mean_score DOUBLE PRECISION,
    score_sd DOUBLE PRECISION
);

CREATE UNIQUE INDEX assessment_quintile_statistics_assessment_id_and_quintile_idx
    ON assessment_quintile_statistics (assessment_id, quintile);
