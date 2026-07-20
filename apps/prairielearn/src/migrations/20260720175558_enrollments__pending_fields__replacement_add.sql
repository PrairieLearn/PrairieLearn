ALTER TABLE enrollments
ADD CONSTRAINT enrollments_pending_fields_null_if_resolved_v2 CHECK (
  user_id IS NULL
  OR (
    pending_uid IS NULL
    AND pending_uin IS NULL
    AND pending_name IS NULL
    AND pending_email IS NULL
    AND pending_lti13_sub IS NULL
    AND pending_lti13_course_instance_id IS NULL
  )
) NOT VALID;
