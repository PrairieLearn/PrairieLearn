ALTER TABLE alternative_groups ADD COLUMN advance_score_perc DOUBLE PRECISION;
ALTER TABLE assessments ADD COLUMN advance_score_perc DOUBLE PRECISION;
ALTER TABLE zones ADD COLUMN advance_score_perc DOUBLE PRECISION;

ALTER TABLE assessment_questions ADD COLUMN advance_score_perc DOUBLE PRECISION;
ALTER TABLE assessment_questions ADD COLUMN effective_advance_score_perc DOUBLE PRECISION;
