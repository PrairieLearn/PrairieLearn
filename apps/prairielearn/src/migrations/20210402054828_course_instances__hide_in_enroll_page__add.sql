ALTER TABLE course_instances
ADD COLUMN IF NOT EXISTS hide_in_enroll_page boolean DEFAULT false;
