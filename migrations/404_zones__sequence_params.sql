ALTER TABLE zones ADD COLUMN sequence_force BOOLEAN DEFAULT false;
ALTER TABLE zones ADD COLUMN sequence_score_perc_threshold DOUBLE PRECISION DEFAULT 1.0;
