ALTER TABLE files
DROP CONSTRAINT files_assessment_instance_id_fkey,
ADD CONSTRAINT files_assessment_instance_id_fkey FOREIGN KEY (assessment_instance_id) REFERENCES assessment_instances (id) ON UPDATE CASCADE ON DELETE SET NULL;
