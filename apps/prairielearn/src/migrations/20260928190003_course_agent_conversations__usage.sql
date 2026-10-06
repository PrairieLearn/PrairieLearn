ALTER TABLE course_agent_conversations
ADD COLUMN usage_model text,
ADD COLUMN usage_version bigint NOT NULL DEFAULT 0,
ADD COLUMN usage_input_tokens bigint NOT NULL DEFAULT 0,
ADD COLUMN usage_input_tokens_cache_read bigint NOT NULL DEFAULT 0,
ADD COLUMN usage_input_tokens_cache_write bigint NOT NULL DEFAULT 0,
ADD COLUMN usage_output_tokens bigint NOT NULL DEFAULT 0,
ADD COLUMN usage_cost double precision DEFAULT 0,
ADD COLUMN usage_input_price double precision,
ADD COLUMN usage_cache_read_price double precision,
ADD COLUMN usage_cache_write_price double precision,
ADD COLUMN usage_output_price double precision,
ADD CONSTRAINT course_agent_conversations_usage_check CHECK (
  usage_version >= 0
  AND usage_input_tokens >= 0
  AND usage_input_tokens_cache_read >= 0
  AND usage_input_tokens_cache_write >= 0
  AND usage_output_tokens >= 0
  AND (
    usage_cost IS NULL
    OR usage_cost >= 0
  )
  AND (
    (
      usage_input_price IS NULL
      AND usage_cache_read_price IS NULL
      AND usage_cache_write_price IS NULL
      AND usage_output_price IS NULL
    )
    OR (
      usage_input_price IS NOT NULL
      AND usage_input_price >= 0
      AND usage_cache_read_price IS NOT NULL
      AND usage_cache_read_price >= 0
      AND usage_cache_write_price IS NOT NULL
      AND usage_cache_write_price >= 0
      AND usage_output_price IS NOT NULL
      AND usage_output_price >= 0
    )
  )
);
