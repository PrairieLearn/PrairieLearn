ALTER TABLE variants
ADD COLUMN IF NOT EXISTS course_id bigint;

ALTER TABLE variants
ADD CONSTRAINT variants_course_id_fkey FOREIGN KEY (course_id) REFERENCES pl_courses (id) ON UPDATE CASCADE ON DELETE CASCADE;
