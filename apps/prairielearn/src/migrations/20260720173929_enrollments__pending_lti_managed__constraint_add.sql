ALTER TABLE enrollments
ADD CONSTRAINT enrollments_pending_lti_managed_not_false CHECK (
  user_id IS NOT NULL
  OR lti_managed IS DISTINCT FROM FALSE
) NOT VALID;
