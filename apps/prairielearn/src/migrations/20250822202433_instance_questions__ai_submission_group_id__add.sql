ALTER TABLE instance_questions
ADD COLUMN ai_submission_group_id bigint REFERENCES ai_submission_groups (id) ON UPDATE CASCADE ON DELETE SET NULL;

ALTER TABLE instance_questions
ADD CONSTRAINT instance_questions_ai_submission_group_for_same_assessment_question CHECK (
  ai_submission_group_id IS NULL
  OR assessment_question_id = (
    SELECT
      assessment_question_id
    FROM
      ai_submission_groups
    WHERE
      id = ai_submission_group_id
  )
)
