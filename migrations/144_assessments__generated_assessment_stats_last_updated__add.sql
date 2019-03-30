ALTER TABLE assessments ADD COLUMN IF NOT EXISTS generated_assessment_stats_last_updated TIMESTAMP WITH TIME ZONE;
