ALTER TABLE assessments
ADD CONSTRAINT assessments_team_work_not_null CHECK (team_work IS NOT NULL) NOT VALID;
