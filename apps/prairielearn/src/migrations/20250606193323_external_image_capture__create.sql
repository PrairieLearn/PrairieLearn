CREATE TABLE IF NOT EXISTS external_image_capture (
  file_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  file_id BIGINT REFERENCES files ON DELETE SET NULL ON UPDATE CASCADE,
  id BIGSERIAL PRIMARY KEY,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  variant_id BIGINT NOT NULL REFERENCES variants ON DELETE CASCADE ON UPDATE CASCADE
);

ALTER TABLE external_image_capture
DROP CONSTRAINT IF EXISTS external_image_capture_variant_id_and_file_name_unique;

ALTER TABLE external_image_capture
ADD CONSTRAINT external_image_capture_variant_id_and_file_name_unique UNIQUE (variant_id, file_name);
