ALTER TABLE assessments VALIDATE CONSTRAINT assessments_team_work_not_null;

ALTER TABLE assessments
ALTER COLUMN team_work
SET NOT NULL;

ALTER TABLE assessments
DROP CONSTRAINT assessments_team_work_not_null;
