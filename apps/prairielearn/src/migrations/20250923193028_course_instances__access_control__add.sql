-- These columns will be nullable if the legacy `allowAccess` is present.
ALTER TABLE course_instances
ADD COLUMN access_control_publish_date TIMESTAMP WITH TIME ZONE;

ALTER TABLE course_instances
ADD COLUMN access_control_archive_date TIMESTAMP WITH TIME ZONE;
