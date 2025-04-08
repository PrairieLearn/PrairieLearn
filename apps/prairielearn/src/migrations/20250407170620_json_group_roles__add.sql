ALTER TABLE assessments
ADD COLUMN json_can_view text[],
ADD COLUMN json_can_submit text[];

ALTER TABLE zones
ADD COLUMN json_can_view text[],
ADD COLUMN json_can_submit text[];

ALTER TABLE assessment_questions
ADD COLUMN json_can_view text[],
ADD COLUMN json_can_submit text[];
