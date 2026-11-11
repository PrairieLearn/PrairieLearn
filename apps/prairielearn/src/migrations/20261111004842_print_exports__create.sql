CREATE TABLE print_exports (
  id BIGSERIAL PRIMARY KEY,
  assessment_id BIGINT NOT NULL REFERENCES assessments (id) ON UPDATE CASCADE ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES users (id) ON UPDATE CASCADE ON DELETE CASCADE,
  authn_user_id BIGINT NOT NULL REFERENCES users (id) ON UPDATE CASCADE ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'succeeded', 'failed')),
  format TEXT NOT NULL CHECK (format IN ('pdf', 'docx')),
  filename TEXT NOT NULL,
  input_key TEXT NOT NULL,
  output_key TEXT,
  size_bytes INTEGER,
  label TEXT,
  failure_message TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finished_at TIMESTAMPTZ
);

CREATE INDEX print_exports_pending_idx ON print_exports (id)
WHERE
  status = 'pending';
