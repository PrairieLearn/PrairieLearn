ALTER TABLE assessments
ALTER COLUMN assessment_set_id
DROP NOT NULL;

--- NOTE: The change below is potentially very expensive, as all rows will be checked.
--- Keep this in mind when deploying.
ALTER TABLE assessments
DROP CONSTRAINT assessments_assessment_set_id_fkey,
ADD CONSTRAINT assessments_assessment_set_id_fkey FOREIGN KEY (assessment_set_id) REFERENCES assessment_sets (id) ON UPDATE CASCADE ON DELETE SET NULL;
