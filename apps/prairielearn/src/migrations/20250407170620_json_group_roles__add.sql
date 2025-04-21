ALTER TABLE assessments
ADD COLUMN json_can_view text[],
ADD COLUMN json_can_submit text[];

ALTER TABLE zones
ADD COLUMN json_can_view text[],
ADD COLUMN json_can_submit text[];

ALTER TABLE alternative_groups
ADD COLUMN json_can_view text[],
ADD COLUMN json_can_submit text[],
ADD COLUMN json_has_alternatives boolean;
