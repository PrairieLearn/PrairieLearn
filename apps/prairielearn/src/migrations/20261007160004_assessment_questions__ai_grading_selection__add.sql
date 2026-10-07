-- Keep the observed credential identity after deletion so a saved selection cannot
-- silently switch to a replacement provider with the same model ID.
ALTER TABLE assessment_questions
ADD COLUMN ai_grading_last_selected_provider enum_ai_grading_provider,
ADD COLUMN ai_grading_last_selected_credential_id BIGINT,
ADD COLUMN ai_grading_last_selected_config_version INTEGER;
