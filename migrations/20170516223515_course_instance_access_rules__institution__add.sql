ALTER TABLE course_instance_access_rules
ADD COLUMN IF NOT EXISTS institution text DEFAULT 'UIUC';
