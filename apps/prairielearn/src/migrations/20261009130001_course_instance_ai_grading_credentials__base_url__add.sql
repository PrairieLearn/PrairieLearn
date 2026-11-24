ALTER TABLE course_instance_ai_grading_credentials
ADD COLUMN base_url text;

ALTER TABLE course_instance_ai_grading_credentials
ADD CONSTRAINT ci_ai_grading_credentials_base_url_check CHECK (
  (
    provider = 'openai-compatible'
    AND base_url IS NOT NULL
    AND length(trim(base_url)) > 0
  )
  OR (
    provider <> 'openai-compatible'
    AND base_url IS NULL
  )
) NOT VALID;
