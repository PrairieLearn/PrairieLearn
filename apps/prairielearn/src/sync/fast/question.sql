-- BLOCK select_matching_question
SELECT
  *
FROM
  questions
WHERE
  qid = ANY ($qids::text[]);

-- BLOCK insert_question
INSERT INTO
  questions (course_id, qid, uuid, deleted_at)
VALUES
  ($course_id, $qid, $uuid, NULL)
RETURNING
  *;

-- BLOCK update_question_errors_and_warnings
UPDATE questions
SET
  sync_errors = $errors,
  sync_warnings = $warnings
WHERE
  id = $id
RETURNING
  *;

-- BLOCK update_question
UPDATE questions
SET
  directory = $qid,
  type = ($data::jsonb ->> 'type')::enum_question_type,
  title = $data::jsonb ->> 'title',
  options = ($data::jsonb -> 'options')::JSONB,
  client_files = jsonb_array_to_text_array ($data::jsonb -> 'client_files'),
  partial_credit = ($data::jsonb ->> 'partial_credit')::boolean,
  grading_method = ($data::jsonb ->> 'grading_method')::enum_grading_method,
  single_variant = ($data::jsonb ->> 'single_variant')::boolean,
  draft = ($data::jsonb ->> 'draft')::boolean,
  show_correct_answer = ($data::jsonb ->> 'show_correct_answer')::boolean,
  template_directory = $data::jsonb ->> 'template_directory',
  topic_id = $topic_id,
  share_publicly = ($data::jsonb ->> 'share_publicly')::boolean,
  share_source_publicly = ($data::jsonb ->> 'share_source_publicly')::boolean,
  json_comment = ($data::jsonb -> 'comment'),
  external_grading_enabled = ($data::jsonb ->> 'external_grading_enabled')::boolean,
  external_grading_image = $data::jsonb ->> 'external_grading_image',
  external_grading_files = jsonb_array_to_text_array ($data::jsonb -> 'external_grading_files'),
  external_grading_entrypoint = $data::jsonb ->> 'external_grading_entrypoint',
  external_grading_timeout = ($data::jsonb ->> 'external_grading_timeout')::integer,
  external_grading_enable_networking = (
    $data::jsonb ->> 'external_grading_enable_networking'
  )::boolean,
  external_grading_environment = ($data::jsonb ->> 'external_grading_environment')::jsonb,
  json_external_grading_comment = ($data::jsonb -> 'external_grading_comment'),
  dependencies = ($data::jsonb ->> 'dependencies')::jsonb,
  workspace_image = $data::jsonb ->> 'workspace_image',
  workspace_port = ($data::jsonb ->> 'workspace_port')::integer,
  workspace_args = $data::jsonb ->> 'workspace_args',
  workspace_home = $data::jsonb ->> 'workspace_home',
  workspace_graded_files = jsonb_array_to_text_array ($data::jsonb -> 'workspace_graded_files'),
  workspace_url_rewrite = ($data::jsonb ->> 'workspace_url_rewrite')::boolean,
  workspace_enable_networking = ($data::jsonb ->> 'workspace_enable_networking')::boolean,
  workspace_environment = ($data::jsonb ->> 'workspace_environment')::jsonb,
  json_workspace_comment = ($data::jsonb -> 'workspace_comment'),
  sync_errors = NULL,
  sync_warnings = $warnings
WHERE
  id = $id
RETURNING
  *;
