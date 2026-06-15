CREATE TYPE enum_transfer_type AS ENUM('CopyQuestion');

CREATE TABLE file_transfers (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users ON DELETE CASCADE ON UPDATE CASCADE,
  from_course_id BIGINT NOT NULL REFERENCES pl_courses ON DELETE CASCADE ON UPDATE CASCADE,
  from_filename text NOT NULL,
  to_course_id BIGINT NOT NULL REFERENCES pl_courses ON DELETE CASCADE ON UPDATE CASCADE,
  created_at timestamptz NOT NULL DEFAULT current_timestamp,
  deleted_at timestamptz,
  storage_filename text NOT NULL UNIQUE,
  transfer_type enum_transfer_type NOT NULL
);
