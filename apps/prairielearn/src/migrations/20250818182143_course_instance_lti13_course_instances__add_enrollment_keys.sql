ALTER TABLE lti13_course_instances
ADD COLUMN enrollment_lti_enforced_after_date TIMESTAMP WITH TIME ZONE;

ALTER TABLE lti13_course_instances
ADD COLUMN enrollment_lti_enforced BOOLEAN DEFAULT FALSE;

ALTER TABLE course_instances
ADD COLUMN self_enrollment_enabled_before_date TIMESTAMP WITH TIME ZONE;

ALTER TABLE course_instances
ADD COLUMN self_enrollment_enabled BOOLEAN DEFAULT TRUE;

ALTER TABLE course_instances
ADD COLUMN self_enrollment_requires_secret_link BOOLEAN default FALSE;
