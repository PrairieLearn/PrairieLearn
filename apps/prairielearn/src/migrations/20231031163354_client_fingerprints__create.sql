CREATE TABLE
  client_fingerprints (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT REFERENCES users (user_id),
    ip_address INET NOT NULL,
    user_agent TEXT NOT NULL,
    accept TEXT NOT NULL,
    accept_language TEXT NOT NULL
  );

-- add client_fingerprint_id to user_sessions
ALTER TABLE user_sessions
ADD COLUMN client_fingerprint_id BIGINT REFERENCES client_fingerprints (id);

-- add client_fingerprint_id to page_view_logs
ALTER TABLE page_view_logs
ADD COLUMN client_fingerprint_id BIGINT REFERENCES client_fingerprints (id);

-- add client_fingerprint_id to submissions
ALTER TABLE submissions
ADD COLUMN client_fingerprint_id BIGINT REFERENCES client_fingerprints (id);

-- add client_fingerprint_id to assessment_instances
ALTER TABLE assessment_instances
ADD COLUMN last_client_fingerprint_id BIGINT REFERENCES client_fingerprints (id);

-- add fingerprint count to assessment_instances
ALTER TABLE assessment_instances
ADD COLUMN client_fingerprint_id_change_count INT NOT NULL DEFAULT 0;
