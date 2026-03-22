CREATE TABLE student_labels (
  id BIGSERIAL PRIMARY KEY,
  course_instance_id BIGINT NOT NULL REFERENCES course_instances (id) ON UPDATE CASCADE ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT NOT NULL,
  uuid UUID NOT NULL,
  -- This also creates an index to lookup student_labels for a course instance.
  -- DEFERRABLE allows name swaps during sync without intermediate constraint violations.
  CONSTRAINT student_labels_course_instance_id_name_key UNIQUE (course_instance_id, name) DEFERRABLE INITIALLY IMMEDIATE,
  UNIQUE (course_instance_id, uuid),
  CONSTRAINT student_labels_name_length_check CHECK (length(name) <= 255)
);

-- This table tracks which enrollments have a given student label.
CREATE TABLE student_label_enrollments (
  id BIGSERIAL PRIMARY KEY,
  enrollment_id BIGINT NOT NULL REFERENCES enrollments (id) ON UPDATE CASCADE ON DELETE CASCADE,
  student_label_id BIGINT NOT NULL REFERENCES student_labels (id) ON UPDATE CASCADE ON DELETE CASCADE,
  UNIQUE (enrollment_id, student_label_id)
);

CREATE INDEX student_label_enrollments_student_label_id_key ON student_label_enrollments (student_label_id);
