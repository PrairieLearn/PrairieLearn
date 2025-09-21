ALTER TABLE instance_questions
ADD COLUMN ai_instance_question_group_id bigint;

ALTER TABLE instance_questions
ADD COLUMN manual_instance_question_group_id bigint;

-- Ensure that the instance question and its AI-selected instance question group
-- have the same assessment question ID.
ALTER TABLE instance_questions
ADD CONSTRAINT instance_questions_ai_group_has_same_aq_id_fkey FOREIGN KEY (
  assessment_question_id,
  ai_instance_question_group_id
) REFERENCES instance_question_groups (assessment_question_id, id) 
-- Assessment question ID should not change.
ON DELETE SET NULL (ai_instance_question_group_id) NOT VALID;

-- Ensure that the instance question and its manually-selected instance question group
-- have the same assessment question ID.
ALTER TABLE instance_questions
ADD CONSTRAINT instance_questions_manual_group_has_same_aq_id_fkey FOREIGN KEY (
  assessment_question_id,
  manual_instance_question_group_id
) REFERENCES instance_question_groups (assessment_question_id, id) 
-- Assessment question ID should not change.
ON DELETE SET NULL (manual_instance_question_group_id) NOT VALID;
