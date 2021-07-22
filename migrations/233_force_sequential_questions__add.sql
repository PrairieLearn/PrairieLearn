ALTER TABLE alternative_groups ADD COLUMN IF NOT EXISTS advance_score_perc DOUBLE PRECISION;
ALTER TABLE assessments ADD COLUMN IF NOT EXISTS advance_score_perc DOUBLE PRECISION;
ALTER TABLE zones ADD COLUMN IF NOT EXISTS advance_score_perc DOUBLE PRECISION;

ALTER TABLE assessment_questions ADD COLUMN IF NOT EXISTS advance_score_perc DOUBLE PRECISION;
ALTER TABLE assessment_questions ADD COLUMN IF NOT EXISTS effective_advance_score_perc DOUBLE PRECISION;
