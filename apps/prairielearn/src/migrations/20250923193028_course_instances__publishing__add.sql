-- These columns will be nullable if the legacy `allowAccess` is present.
ALTER TABLE course_instances
ADD COLUMN publishing_publish_date TIMESTAMP WITH TIME ZONE;

ALTER TABLE course_instances
ADD COLUMN publishing_archive_date TIMESTAMP WITH TIME ZONE;
