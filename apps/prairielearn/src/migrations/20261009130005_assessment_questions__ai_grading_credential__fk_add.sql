ALTER TABLE assessment_questions
ADD CONSTRAINT assessment_questions_ai_grading_credential_fkey FOREIGN KEY (ai_grading_last_selected_credential_id) REFERENCES course_instance_ai_grading_credentials (id) ON UPDATE CASCADE ON DELETE SET NULL NOT VALID;
