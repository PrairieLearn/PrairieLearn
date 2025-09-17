ALTER TABLE instance_questions
ADD COLUMN ai_instance_question_group_id bigint;

ALTER TABLE instance_questions
ADD COLUMN manual_instance_question_group_id bigint;

ALTER TABLE instance_questions
ADD CONSTRAINT instance_questions_ai_instance_question_group_id_fkey FOREIGN KEY (ai_instance_question_group_id) REFERENCES instance_question_groups (id) ON UPDATE CASCADE ON DELETE SET NULL NOT VALID;

ALTER TABLE instance_questions
ADD CONSTRAINT instance_questions_manual_instance_question_group_id_fkey FOREIGN KEY (manual_instance_question_group_id) REFERENCES instance_question_groups (id) ON UPDATE CASCADE ON DELETE SET NULL NOT VALID;

ALTER TABLE instance_questions
ADD CONSTRAINT instance_questions_ai_group_has_same_aq_id_fkey FOREIGN KEY (
  assessment_question_id,
  ai_instance_question_group_id
) REFERENCES instance_question_groups (assessment_question_id, id) ON UPDATE NO ACTION ON DELETE NO ACTION NOT VALID;

ALTER TABLE instance_questions
ADD CONSTRAINT instance_questions_manual_group_has_same_aq_id_fkey FOREIGN KEY (
  assessment_question_id,
  manual_instance_question_group_id
) REFERENCES instance_question_groups (assessment_question_id, id) ON UPDATE NO ACTION ON DELETE NO ACTION NOT VALID;
