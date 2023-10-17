ALTER TABLE assessments
DROP CONSTRAINT assessments_assessment_set_id_fkey,
ADD CONSTRAINT assessments_assessment_set_id_fkey FOREIGN KEY (assessment_set_id) REFERENCES assessment_sets (id) ON UPDATE CASCADE ON DELETE CASCADE;
