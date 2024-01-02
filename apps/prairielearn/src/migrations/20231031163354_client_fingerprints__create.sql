CREATE TABLE client_fingerprints (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT REFERENCES users (user_id),
  user_session_id BIGINT NOT NULL REFERENCES user_sessions (id),
  ip_address INET NOT NULL,
  user_agent VARCHAR(255),
  accept_language VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- add client_fingerprint_id to page_view_logs
ALTER TABLE page_view_logs
ADD COLUMN client_fingerprint_id BIGINT REFERENCES client_fingerprints (id) ON UPDATE CASCADE ON DELETE SET NULL;

-- add client_fingerprint_id to submissions
ALTER TABLE submissions
ADD COLUMN client_fingerprint_id BIGINT REFERENCES client_fingerprints (id) ON UPDATE CASCADE ON DELETE SET NULL;

-- add client_fingerprint_id to assessment_instances
ALTER TABLE assessment_instances
ADD COLUMN last_client_fingerprint_id BIGINT REFERENCES client_fingerprints (id) ON UPDATE CASCADE ON DELETE SET NULL;

-- add fingerprint count to assessment_instances
ALTER TABLE assessment_instances
ADD COLUMN client_fingerprint_id_change_count INT NOT NULL DEFAULT 0;

-- add client_fingerprint_id to assessment_state_logs
ALTER TABLE assessment_state_logs
ADD COLUMN client_fingerprint_id BIGINT REFERENCES client_fingerprints (id) ON UPDATE CASCADE ON DELETE SET NULL;

-- create index
CREATE INDEX client_fingerprints_user_id_user_session_id_ip_address_idx ON client_fingerprints (user_id, user_session_id, ip_address);
