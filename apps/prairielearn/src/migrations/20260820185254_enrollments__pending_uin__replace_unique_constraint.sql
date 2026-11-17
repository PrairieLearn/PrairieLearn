-- The replacement index was built concurrently, so this swap does not rebuild or scan it.
ALTER TABLE enrollments
DROP CONSTRAINT enrollments_course_instance_id_pending_uin_key,
-- squawk-ignore constraint-missing-not-valid, disallowed-unique-constraint
ADD CONSTRAINT enrollments_pending_uin_course_instance_id_key UNIQUE USING INDEX enrollments_pending_uin_course_instance_id_idx;
