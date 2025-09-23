-- These columns will be nullable if the legacy `allowAccess` is present.
ALTER TABLE course_instances
ADD COLUMN access_control_published BOOLEAN;

ALTER TABLE course_instances
ADD COLUMN access_control_published_start_date_enabled BOOLEAN;

ALTER TABLE course_instances
ADD COLUMN access_control_published_start_date TIMESTAMP WITH TIME ZONE;

ALTER TABLE course_instances
ADD COLUMN access_control_published_end_date TIMESTAMP WITH TIME ZONE;
