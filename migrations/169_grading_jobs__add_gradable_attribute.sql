ALTER TABLE grading_jobs ADD COLUMN gradable BOOLEAN;
UPDATE grading_jobs SET gradable=true;
