CREATE TABLE IF NOT EXISTS assessment_tools (
  id BIGSERIAL PRIMARY KEY,
  zone_id BIGINT REFERENCES zones (id) ON UPDATE CASCADE ON DELETE CASCADE,
  assessment_id BIGINT REFERENCES assessments (id) ON UPDATE CASCADE ON DELETE CASCADE,
  tool TEXT NOT NULL,
  settings JSONB NOT NULL DEFAULT '{}'::JSONB,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE (zone_id, tool),
  UNIQUE (assessment_id, tool),
  -- XOR check constraint that zone_id or assessment_id is null, but not both
  CONSTRAINT zone_assessment_XOR CHECK (
    (
      zone_id IS NOT NULL
      AND assessment_id IS NULL
    )
    OR (
      zone_id IS NULL
      AND assessment_id IS NOT NULL
    )
  )
);
