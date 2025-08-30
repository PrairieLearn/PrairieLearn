ALTER TABLE instance_questions
ADD COLUMN ai_submission_group_id bigint REFERENCES ai_submission_groups (id) ON UPDATE CASCADE ON DELETE SET NULL;

ALTER TABLE instance_questions
ADD CONSTRAINT instance_questions_ai_submission_group_has_same_aq_id_fkey FOREIGN KEY (assessment_question_id, ai_submission_group_id) REFERENCES ai_submission_groups (assessment_question_id, id) ON UPDATE CASCADE ON DELETE SET NULL;
