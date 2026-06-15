ALTER TABLE alternative_groups
ADD COLUMN json_points JSONB,
ADD COLUMN json_auto_points JSONB,
ADD COLUMN json_manual_points DOUBLE PRECISION,
ADD COLUMN json_max_points DOUBLE PRECISION,
ADD COLUMN json_max_auto_points DOUBLE PRECISION,
ADD COLUMN json_force_max_points BOOLEAN,
ADD COLUMN json_tries_per_variant INTEGER;

ALTER TABLE assessment_questions
ADD COLUMN json_points JSONB,
ADD COLUMN json_auto_points JSONB,
ADD COLUMN json_manual_points DOUBLE PRECISION,
ADD COLUMN json_max_points DOUBLE PRECISION,
ADD COLUMN json_max_auto_points DOUBLE PRECISION,
ADD COLUMN json_force_max_points BOOLEAN,
ADD COLUMN json_tries_per_variant INTEGER;
