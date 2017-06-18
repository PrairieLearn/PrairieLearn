CREATE UNIQUE INDEX assessment_quintile_statistics_assessment_id_and_quintile_idx
    ON assessment_quintile_statistics (assessment_id, quintile);