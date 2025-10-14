ALTER TABLE audit_events
ADD COLUMN enrollment_id BIGINT;

ALTER TABLE audit_events
ADD CONSTRAINT audit_events_enrollment_id_fkey FOREIGN KEY (enrollment_id) REFERENCES enrollments (id) ON DELETE SET NULL ON UPDATE CASCADE NOT VALID;

-- Events that affect an enrollment in a course instance
CREATE INDEX audit_events_table_name_enrollment_id_course_instance_id_idx ON audit_events (enrollment_id, table_name, course_instance_id)
WHERE
  enrollment_id IS NOT NULL;
