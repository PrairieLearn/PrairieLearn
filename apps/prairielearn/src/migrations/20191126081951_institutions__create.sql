CREATE TABLE institutions (
  id bigserial PRIMARY KEY,
  long_name TEXT NOT NULL UNIQUE,
  short_name TEXT NOT NULL UNIQUE,
  uid_pattern TEXT
);

INSERT INTO
  institutions (id, long_name, short_name)
VALUES
  (1, 'Default', 'Default');

ALTER TABLE pl_courses
ADD COLUMN institution_id bigint REFERENCES institutions (id) ON UPDATE CASCADE ON DELETE SET NULL;

UPDATE pl_courses
SET
  institution_id = 1;
