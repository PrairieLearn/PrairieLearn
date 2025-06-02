CREATE TABLE IF NOT EXISTS external_image_capture (
  answer_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ DEFAULT NULL,
  file_id BIGINT REFERENCES files ON DELETE SET NULL ON UPDATE CASCADE,
  id BIGSERIAL PRIMARY KEY,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  user_id BIGINT NOT NULL REFERENCES users ON DELETE CASCADE ON UPDATE CASCADE,
  variant_id BIGINT NOT NULL REFERENCES variants ON DELETE SET NULL ON UPDATE CASCADE
);

ALTER TABLE external_image_capture
ADD CONSTRAINT external_image_capture_variant_id_and_answer_name_unique UNIQUE (variant_id, answer_name);
