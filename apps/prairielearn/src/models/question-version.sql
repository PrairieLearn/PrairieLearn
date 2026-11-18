-- BLOCK select_questions
SELECT
  id,
  qid,
  uuid
FROM
  questions
WHERE
  course_id = $course_id
  AND deleted_at IS NULL
  AND qid IS NOT NULL;

-- BLOCK select_current_versions
SELECT
  to_jsonb(qv.*) AS question_version,
  EXISTS (
    SELECT
      1
    FROM
      question_version_settings AS s
    WHERE
      s.question_version_id = qv.id
  ) AS has_settings,
  EXISTS (
    SELECT
      1
    FROM
      chunks AS c
    WHERE
      c.question_id = qv.question_id
      AND c.type = 'question'
      AND c.created_at <= qv.created_at
      AND (
        c.superseded_at IS NULL
        OR c.superseded_at > qv.created_at
      )
  ) AS has_chunk
FROM
  question_versions AS qv
  JOIN questions AS q ON q.id = qv.question_id
WHERE
  q.course_id = $course_id
  AND qv.superseded_at IS NULL;

-- BLOCK lock_course
SELECT
  id
FROM
  courses
WHERE
  id = $course_id
FOR NO KEY UPDATE;

-- BLOCK select_publication_date
SELECT
  GREATEST(
    clock_timestamp(),
    (
      SELECT
        MAX(last_date) + interval '1 microsecond'
      FROM
        (
          SELECT
            GREATEST(qv.created_at, qv.superseded_at) AS last_date
          FROM
            question_versions AS qv
            JOIN questions AS q ON q.id = qv.question_id
          WHERE
            q.course_id = $course_id
          UNION ALL
          SELECT
            GREATEST(created_at, superseded_at) AS last_date
          FROM
            chunks
          WHERE
            course_id = $course_id
        ) AS dates
    )
  )::text;

-- BLOCK supersede_versions
UPDATE question_versions
SET
  superseded_at = $published_at::timestamptz
WHERE
  id = ANY ($version_ids::bigint[])
  AND superseded_at IS NULL;

-- BLOCK insert_versions
WITH
  inserted_versions AS (
    INSERT INTO
      question_versions (
        question_id,
        source_hash,
        dependency_hash,
        commit_hash,
        created_at,
        uses_chunks
      )
    SELECT
      (version ->> 'question_id')::bigint,
      version ->> 'source_hash',
      version ->> 'dependency_hash',
      $commit_hash,
      $published_at::timestamptz,
      $uses_chunks
    FROM
      JSONB_ARRAY_ELEMENTS($versions::jsonb) AS version
    RETURNING
      id,
      question_id
  )
INSERT INTO
  question_version_settings (
    question_version_id,
    client_files,
    dependencies,
    directory,
    external_grading_enable_networking,
    external_grading_entrypoint,
    external_grading_environment,
    external_grading_files,
    external_grading_image,
    external_grading_timeout,
    grading_method,
    options,
    partial_credit,
    preferences_schema,
    show_correct_answer,
    single_variant,
    template_directory,
    title,
    type,
    workspace_args,
    workspace_enable_networking,
    workspace_environment,
    workspace_graded_files,
    workspace_home,
    workspace_image,
    workspace_port,
    workspace_url_rewrite
  )
SELECT
  inserted_versions.id,
  settings.client_files,
  settings.dependencies,
  settings.directory,
  settings.external_grading_enable_networking,
  settings.external_grading_entrypoint,
  settings.external_grading_environment,
  settings.external_grading_files,
  settings.external_grading_image,
  settings.external_grading_timeout,
  settings.grading_method,
  settings.options,
  settings.partial_credit,
  settings.preferences_schema,
  settings.show_correct_answer,
  settings.single_variant,
  settings.template_directory,
  settings.title,
  settings.type,
  settings.workspace_args,
  settings.workspace_enable_networking,
  settings.workspace_environment,
  settings.workspace_graded_files,
  settings.workspace_home,
  settings.workspace_image,
  settings.workspace_port,
  settings.workspace_url_rewrite
FROM
  JSONB_ARRAY_ELEMENTS($versions::jsonb) AS version
  JOIN inserted_versions ON inserted_versions.question_id = (version ->> 'question_id')::bigint
  CROSS JOIN LATERAL JSONB_POPULATE_RECORD(
    NULL::question_version_settings,
    version -> 'settings'
  ) AS settings;

-- BLOCK select_question_version_at_date
SELECT
  to_jsonb(qv.*) AS question_version,
  to_jsonb(s.*) AS settings,
  to_jsonb(c.*) AS chunk,
  qv.created_at::text AS version_date
FROM
  question_versions AS qv
  -- Keep incomplete versions visible rather than substituting older or live settings.
  LEFT JOIN question_version_settings AS s ON s.question_version_id = qv.id
  LEFT JOIN chunks AS c ON qv.uses_chunks
  AND c.question_id = qv.question_id
  AND c.type = 'question'
  AND NOT c.deleted
  AND c.created_at <= qv.created_at
  AND (
    c.superseded_at IS NULL
    OR c.superseded_at > qv.created_at
  )
WHERE
  qv.question_id = $question_id
  AND qv.created_at <= $at_date::timestamptz
  AND (
    qv.superseded_at IS NULL
    OR qv.superseded_at > $at_date::timestamptz
  );
