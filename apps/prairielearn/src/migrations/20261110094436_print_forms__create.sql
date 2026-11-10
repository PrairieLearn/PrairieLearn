CREATE TABLE print_forms (
  id BIGSERIAL PRIMARY KEY,
  assessment_id BIGINT NOT NULL REFERENCES assessments (id) ON UPDATE CASCADE ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES users (id) ON UPDATE CASCADE ON DELETE CASCADE,
  authn_user_id BIGINT NOT NULL REFERENCES users (id) ON UPDATE CASCADE ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX print_forms_assessment_id_user_id_idx ON print_forms (assessment_id, user_id);

CREATE TABLE print_form_questions (
  id BIGSERIAL PRIMARY KEY,
  print_form_id BIGINT NOT NULL REFERENCES print_forms (id) ON UPDATE CASCADE ON DELETE CASCADE,
  assessment_question_id BIGINT NOT NULL REFERENCES assessment_questions (id) ON UPDATE CASCADE ON DELETE CASCADE,
  variant_id BIGINT NOT NULL UNIQUE REFERENCES variants (id) ON UPDATE CASCADE,
  position INTEGER NOT NULL,
  question_number TEXT NOT NULL,
  max_points DOUBLE PRECISION NOT NULL,
  UNIQUE (print_form_id, assessment_question_id),
  UNIQUE (print_form_id, position)
);
