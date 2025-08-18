-- A null date is used to indicate that the enrollment is not enforced.
ALTER TABLE course_instances ADD COLUMN enrollment_lti_enforced TIMESTAMP WITH TIME ZONE;
-- A null date is used to indicate that self-enrollment is not enabled.
ALTER TABLE course_instances ADD COLUMN self_enrollment_enabled TIMESTAMP WITH TIME ZONE;
-- If this is true, self-enrollment requires a secret link to enroll.
ALTER TABLE course_instances ADD COLUMN self_enrollment_requires_secret_link BOOLEAN default FALSE;
