-- These columns will be nullable if the legacy `allowAccess` is present
-- or if the course is not published.
ALTER TABLE course_instances
ADD COLUMN publishing_publish_date TIMESTAMP WITH TIME ZONE;

ALTER TABLE course_instances
ADD COLUMN publishing_archive_date TIMESTAMP WITH TIME ZONE;

-- This column explicitly tracks whether the course is using the modern publishing system.
ALTER TABLE course_instances
ADD COLUMN modern_publishing BOOLEAN NOT NULL DEFAULT FALSE;

-- Ensure that either both publish date and archive date are null, or neither are null
ALTER TABLE course_instances
ADD CONSTRAINT course_instances_publishing_dates_consistency_check CHECK (
  (
    publishing_publish_date IS NULL
    AND publishing_archive_date IS NULL
  )
  OR (
    publishing_publish_date IS NOT NULL
    AND publishing_archive_date IS NOT NULL
  )
);
