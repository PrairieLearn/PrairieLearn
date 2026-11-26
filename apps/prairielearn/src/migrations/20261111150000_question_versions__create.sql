-- Versions exist independently of archives: local development reads files from disk.
CREATE TABLE question_versions (
  id bigserial PRIMARY KEY,
  question_id bigint NOT NULL REFERENCES questions (id) ON UPDATE CASCADE ON DELETE CASCADE,
  commit_hash text,
  created_at timestamptz NOT NULL,
  superseded_at timestamptz,
  source_hash text NOT NULL,
  dependency_hash text NOT NULL,
  uses_chunks boolean NOT NULL,
  UNIQUE (question_id, id),
  CHECK (superseded_at > created_at)
);

CREATE INDEX question_versions_question_id_created_at_idx ON question_versions (question_id, created_at);

CREATE UNIQUE INDEX question_versions_current_question_id_key ON question_versions (question_id)
WHERE
  superseded_at IS NULL;

-- Every published version owns a fresh settings row, even when the values are unchanged.
-- Writers supply normalized settings explicitly, without applying new defaults to history.
CREATE TABLE question_version_settings (
  question_version_id bigint PRIMARY KEY REFERENCES question_versions (id) ON UPDATE CASCADE ON DELETE CASCADE,
  client_files text[],
  dependencies jsonb NOT NULL,
  directory text NOT NULL,
  external_grading_enable_networking boolean,
  external_grading_entrypoint text,
  external_grading_environment jsonb NOT NULL,
  external_grading_files text[],
  external_grading_image text,
  external_grading_timeout integer,
  grading_method enum_grading_method NOT NULL,
  options jsonb,
  partial_credit boolean,
  preferences_schema jsonb,
  show_correct_answer boolean,
  single_variant boolean,
  template_directory text,
  title text NOT NULL,
  type enum_question_type NOT NULL,
  workspace_args text,
  workspace_enable_networking boolean,
  workspace_environment jsonb NOT NULL,
  workspace_graded_files text[],
  workspace_home text,
  workspace_image text,
  workspace_port integer,
  workspace_url_rewrite boolean
);
