CREATE TABLE student_labels (
  id BIGSERIAL PRIMARY KEY,
  course_instance_id BIGINT NOT NULL REFERENCES course_instances (id) ON UPDATE CASCADE ON DELETE CASCADE,
  name TEXT NOT NULL,
  color text NOT NULL,
  -- This also creates an index to lookup student_labels for a course instance.
  UNIQUE (course_instance_id, name),
  CONSTRAINT student_labels_name_length_check CHECK (length(name) <= 1000)
);

-- This table is used to track which enrollments (enrolled users) are members of a given student label.
CREATE TABLE student_label_enrollments (
  id BIGSERIAL PRIMARY KEY,
  enrollment_id BIGINT NOT NULL REFERENCES enrollments (id) ON UPDATE CASCADE ON DELETE CASCADE,
  student_label_id BIGINT NOT NULL REFERENCES student_labels (id) ON UPDATE CASCADE ON DELETE CASCADE,
  -- Entries in this table are hard-deleted.
  UNIQUE (enrollment_id, student_label_id)
);

-- This index is used to quickly find all enrollments that are members of a given student label.
CREATE INDEX student_label_enrollments_student_label_id_key ON student_label_enrollments (student_label_id);
