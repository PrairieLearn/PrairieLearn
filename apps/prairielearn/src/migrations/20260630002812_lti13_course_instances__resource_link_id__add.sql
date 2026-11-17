-- The course-navigation resource link is captured on every instructor launch so
-- that we can request per-member custom claims from NRPS via `?rlid=`.
ALTER TABLE lti13_course_instances
ADD COLUMN resource_link_id text;
