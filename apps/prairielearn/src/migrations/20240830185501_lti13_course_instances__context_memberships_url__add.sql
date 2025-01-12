ALTER TABLE lti13_course_instances
ADD COLUMN IF NOT EXISTS context_memberships_url TEXT;
