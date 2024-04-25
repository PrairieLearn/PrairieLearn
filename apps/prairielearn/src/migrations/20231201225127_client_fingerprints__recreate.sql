-- We neglected to add a UNIQUE constraint when introducing client fingerprints.
-- To safely add this constraint, we'll revert all the schema changes and start
-- over from scratch.
ALTER TABLE variants
DROP COLUMN client_fingerprint_id;

ALTER TABLE assessment_state_logs
DROP COLUMN client_fingerprint_id;

ALTER TABLE assessment_instances
DROP COLUMN client_fingerprint_id_change_count;

ALTER TABLE assessment_instances
DROP COLUMN last_client_fingerprint_id;

ALTER TABLE submissions
DROP COLUMN client_fingerprint_id;

ALTER TABLE page_view_logs
DROP COLUMN client_fingerprint_id;

DROP TABLE client_fingerprints;

-- Recreate the table with the UNIQUE constraint.
CREATE TABLE client_fingerprints (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT REFERENCES users (user_id),
  user_session_id BIGINT NOT NULL REFERENCES user_sessions (id),
  ip_address INET NOT NULL,
  user_agent VARCHAR(255),
  accept_language VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE NULLS NOT DISTINCT (
    user_id,
    user_session_id,
    ip_address,
    user_agent,
    accept_language
  )
);

ALTER TABLE page_view_logs
ADD COLUMN client_fingerprint_id BIGINT REFERENCES client_fingerprints (id) ON UPDATE CASCADE ON DELETE SET NULL;

ALTER TABLE submissions
ADD COLUMN client_fingerprint_id BIGINT REFERENCES client_fingerprints (id) ON UPDATE CASCADE ON DELETE SET NULL;

ALTER TABLE assessment_instances
ADD COLUMN last_client_fingerprint_id BIGINT REFERENCES client_fingerprints (id) ON UPDATE CASCADE ON DELETE SET NULL;

ALTER TABLE assessment_instances
ADD COLUMN client_fingerprint_id_change_count INT NOT NULL DEFAULT 0;

ALTER TABLE assessment_state_logs
ADD COLUMN client_fingerprint_id BIGINT REFERENCES client_fingerprints (id) ON UPDATE CASCADE ON DELETE SET NULL;

ALTER TABLE variants
ADD COLUMN client_fingerprint_id BIGINT REFERENCES client_fingerprints (id) ON UPDATE CASCADE ON DELETE SET NULL;
