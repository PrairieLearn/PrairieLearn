ALTER TABLE assessment_instances
ADD COLUMN IF NOT EXISTS tmp_upgraded_iq_status BOOLEAN DEFAULT FALSE;
