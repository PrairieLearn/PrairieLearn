CREATE TABLE print_forms (
  id BIGSERIAL PRIMARY KEY,
  assessment_id BIGINT NOT NULL REFERENCES assessments (id) ON UPDATE CASCADE ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES users (id) ON UPDATE CASCADE ON DELETE CASCADE,
  authn_user_id BIGINT NOT NULL REFERENCES users (id) ON UPDATE CASCADE ON DELETE CASCADE,
  label TEXT NOT NULL CHECK (label ~ '^[A-Z]+$'),
  settings JSONB NOT NULL,
  archived_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (assessment_id, label)
);

CREATE INDEX print_forms_user_id_idx ON print_forms (user_id);

CREATE INDEX print_forms_authn_user_id_idx ON print_forms (authn_user_id);

CREATE TABLE print_form_questions (
  id BIGSERIAL PRIMARY KEY,
  print_form_id BIGINT NOT NULL REFERENCES print_forms (id) ON UPDATE CASCADE ON DELETE CASCADE,
  assessment_question_id BIGINT NOT NULL REFERENCES assessment_questions (id) ON UPDATE CASCADE ON DELETE CASCADE,
  variant_id BIGINT NOT NULL UNIQUE REFERENCES variants (id) ON UPDATE CASCADE ON DELETE CASCADE,
  position INTEGER NOT NULL,
  question_number TEXT NOT NULL,
  max_points DOUBLE PRECISION NOT NULL,
  UNIQUE (print_form_id, assessment_question_id),
  UNIQUE (print_form_id, position)
);

CREATE INDEX print_form_questions_assessment_question_id_idx ON print_form_questions (assessment_question_id);

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
  finished_at TIMESTAMPTZ,
  CONSTRAINT print_exports_output_key_matches_status CHECK ((status = 'succeeded') = (output_key IS NOT NULL))
);

CREATE INDEX print_exports_pending_idx ON print_exports (id)
WHERE
  status = 'pending';

CREATE INDEX print_exports_assessment_id_authn_user_id_created_at_id_idx ON print_exports (
  assessment_id,
  authn_user_id,
  created_at DESC,
  id DESC
);
