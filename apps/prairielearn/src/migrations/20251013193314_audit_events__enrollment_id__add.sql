ALTER TABLE audit_events
ADD COLUMN enrollment_id BIGINT REFERENCES enrollments (id) ON DELETE CASCADE ON UPDATE CASCADE;

-- Events that affect an enrollment in a course instance
CREATE INDEX audit_events_table_name_enrollment_id_course_instance_id_idx ON audit_events (enrollment_id, table_name, course_instance_id)
WHERE
  enrollment_id IS NOT NULL;
