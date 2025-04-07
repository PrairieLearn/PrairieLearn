ALTER TABLE assessment_questions
ADD COLUMN json_can_view text[],
ADD COLUMN json_can_submit text[];
