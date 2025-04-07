ALTER TABLE assessments
ADD COLUMN json_can_view text[],
ADD COLUMN json_can_submit text[];
