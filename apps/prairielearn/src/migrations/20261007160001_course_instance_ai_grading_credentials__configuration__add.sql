ALTER TABLE course_instance_ai_grading_credentials
ADD COLUMN base_url TEXT,
ADD COLUMN config_version INTEGER NOT NULL DEFAULT 1,
ADD COLUMN model_capabilities JSONB NOT NULL DEFAULT '{}'::jsonb,
ADD CONSTRAINT ci_ai_grading_credentials_configuration_check CHECK (
  config_version > 0
  AND jsonb_typeof(model_capabilities) = 'object'
  AND (
    (
      provider = 'openai-compatible'
      AND base_url IS NOT NULL
      AND base_url <> ''
    )
    OR (
      provider <> 'openai-compatible'
      AND base_url IS NULL
      AND model_capabilities = '{}'::jsonb
    )
  )
) NOT VALID;
