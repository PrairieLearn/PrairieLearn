CREATE TABLE course_instance_publishing_extensions (
  id BIGSERIAL PRIMARY KEY,
  course_instance_id BIGINT NOT NULL REFERENCES course_instances ON DELETE CASCADE ON UPDATE CASCADE,
  name TEXT,
  end_date TIMESTAMP WITH TIME ZONE NOT NULL
);

-- Quickly lookup all extensions for a given course instance.
CREATE INDEX course_instance_publishing_extensions_course_instance_id_idx ON course_instance_publishing_extensions (course_instance_id);

-- Ensure names are unique within each course instance.
ALTER TABLE course_instance_publishing_extensions
ADD CONSTRAINT course_instance_publishing_extensions_unique_name UNIQUE (course_instance_id, name);

-- Add check constraint to prevent empty string names
ALTER TABLE course_instance_publishing_extensions
ADD CONSTRAINT course_instance_publishing_extensions_name_not_empty CHECK (
  name IS NULL
  -- Whitespace is trimmed from names in the UI.
  OR name != ''
) NOT VALID;

-- Ensure names are not too long.
ALTER TABLE course_instance_publishing_extensions
ADD CONSTRAINT course_instance_publishing_extensions_name_length_check CHECK (LENGTH(name) <= 1000) NOT VALID;
