-- BLOCK select_current_course_chunks
SELECT
  chunks.*,
  q.uuid AS question_uuid,
  q.qid AS question_name,
  a.uuid AS assessment_uuid,
  a.tid AS assessment_name,
  ci.uuid AS course_instance_uuid,
  ci.short_name AS course_instance_name
FROM
  chunks
  LEFT JOIN assessments AS a ON (a.id = chunks.assessment_id)
  LEFT JOIN course_instances AS ci ON (
    ci.id = chunks.course_instance_id
    OR ci.id = a.course_instance_id
  )
  LEFT JOIN questions AS q ON (q.id = chunks.question_id)
WHERE
  chunks.course_id = $course_id
  AND chunks.superseded_at IS NULL;

-- BLOCK select_course_chunks_at_date
SELECT
  chunks.*
FROM
  chunks
WHERE
  chunks.course_id = $course_id
  -- Undated rows predate history and were live from the start.
  AND (
    chunks.created_at IS NULL
    OR chunks.created_at <= $at_date
  )
  AND (
    chunks.superseded_at IS NULL
    OR chunks.superseded_at > $at_date
  );

-- BLOCK select_metadata_for_chunks
SELECT
  chunks.*,
  (chunks_arr ->> 'type')::enum_chunk_type AS type,
  q.qid AS question_name,
  a.tid AS assessment_name,
  ci.short_name AS course_instance_name
FROM
  JSONB_ARRAY_ELEMENTS($chunks_arr::jsonb) AS chunks_arr
  -- Preserve missing/deleted requests so consumers can remove their runtime paths.
  LEFT JOIN chunks ON (
    chunks.course_id = $course_id
    AND chunks.superseded_at IS NULL
    AND chunks.type = (chunks_arr ->> 'type')::enum_chunk_type
    AND coalesce(chunks.question_id, -1) = coalesce((chunks_arr ->> 'questionId')::bigint, -1)
    AND coalesce(chunks.course_instance_id, -1) = coalesce((chunks_arr ->> 'courseInstanceId')::bigint, -1)
    AND coalesce(chunks.assessment_id, -1) = coalesce((chunks_arr ->> 'assessmentId')::bigint, -1)
  )
  LEFT JOIN assessments AS a ON (a.id = (chunks_arr ->> 'assessmentId')::bigint)
  LEFT JOIN course_instances AS ci ON (
    ci.id = (chunks_arr ->> 'courseInstanceId')::bigint
    OR ci.id = a.course_instance_id
  )
  LEFT JOIN questions AS q ON (q.id = (chunks_arr ->> 'questionId')::bigint);

-- BLOCK select_course_dir
SELECT
  c.path
FROM
  courses AS c
WHERE
  c.id = $course_id
  AND c.deleted_at IS NULL;

-- BLOCK select_template_question_ids
WITH RECURSIVE
  template_questions AS (
    -- non-recursive term that finds the ID of the template question (if any) for question_id
    SELECT
      tq.id,
      tq.qid,
      tq.course_id,
      tq.template_directory
    FROM
      questions AS q
      JOIN questions AS tq ON (
        tq.qid = q.template_directory
        AND tq.course_id = q.course_id
      )
    WHERE
      q.id = $question_id
      AND tq.deleted_at IS NULL
      -- required UNION for a recursive WITH statement
    UNION
    -- recursive term that references template_questions again
    SELECT
      tq.id,
      tq.qid,
      tq.course_id,
      tq.template_directory
    FROM
      template_questions AS q
      JOIN questions AS tq ON (
        tq.qid = q.template_directory
        AND tq.course_id = q.course_id
      )
    WHERE
      tq.deleted_at IS NULL
  )
SELECT
  id
FROM
  template_questions
LIMIT
  100;

-- BLOCK lock_course_for_chunk_publication
SELECT
  id
FROM
  courses
WHERE
  id = $course_id
FOR NO KEY UPDATE;

-- BLOCK supersede_chunks
WITH
  chunk_publication AS (
    SELECT
      clock_timestamp() AS created_at
  ),
  superseded AS (
    UPDATE chunks
    SET
      superseded_at = chunk_publication.created_at
    FROM
      chunk_publication
    WHERE
      course_id = $course_id
      AND id = ANY ($chunk_ids::bigint[])
      AND superseded_at IS NULL
  )
SELECT
  created_at::text
FROM
  chunk_publication;

-- BLOCK insert_chunks
WITH
  inserted_chunks AS (
    INSERT INTO
      chunks (
        type,
        course_id,
        question_id,
        course_instance_id,
        assessment_id,
        uuid,
        created_at,
        commit_hash,
        size_compressed,
        size_uncompressed
      )
    SELECT
      (chunk ->> 'type')::enum_chunk_type,
      $course_id,
      q.id AS question_id,
      ci.id AS course_instance_id,
      a.id AS assessment_id,
      (chunk ->> 'uuid')::uuid,
      $created_at::timestamptz,
      $commit_hash,
      (chunk ->> 'sizeCompressed')::bigint,
      (chunk ->> 'sizeUncompressed')::bigint
    FROM
      JSONB_ARRAY_ELEMENTS($chunks::jsonb) AS chunk
      LEFT JOIN questions AS q ON (
        q.qid = (chunk ->> 'questionName')
        AND q.deleted_at IS NULL
        AND q.course_id = $course_id
      )
      LEFT JOIN course_instances AS ci ON (
        ci.short_name = (chunk ->> 'courseInstanceName')
        AND ci.deleted_at IS NULL
        AND ci.course_id = $course_id
      )
      LEFT JOIN assessments AS a ON (
        a.tid = (chunk ->> 'assessmentName')
        AND a.deleted_at IS NULL
        AND a.course_instance_id = ci.id
      )
    RETURNING
      id,
      uuid
  )
INSERT INTO
  question_versions (
    chunk_id,
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
  inserted_chunks.id,
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
  JSONB_ARRAY_ELEMENTS($chunks::jsonb) AS chunk
  JOIN inserted_chunks ON inserted_chunks.uuid = (chunk ->> 'uuid')::uuid
  CROSS JOIN LATERAL JSONB_POPULATE_RECORD(
    NULL::question_versions,
    chunk -> 'questionSettings'
  ) AS settings
WHERE
  chunk -> 'questionSettings' IS NOT NULL;

-- BLOCK select_active_assessment_ids_by_tid
SELECT
  ci.short_name AS course_instance_name,
  a.tid AS assessment_name,
  a.id AS assessment_id
FROM
  assessments AS a
  JOIN course_instances AS ci ON (ci.id = a.course_instance_id)
WHERE
  ci.course_id = $course_id
  AND ci.deleted_at IS NULL
  AND a.deleted_at IS NULL;

-- BLOCK select_active_course_instance_ids
SELECT
  ci.short_name AS course_instance_name,
  ci.id AS course_instance_id
FROM
  course_instances AS ci
WHERE
  ci.course_id = $course_id
  AND ci.deleted_at IS NULL;

-- BLOCK select_current_question_versions
SELECT
  qv.*
FROM
  question_versions AS qv
  JOIN chunks AS c ON c.id = qv.chunk_id
WHERE
  c.course_id = $course_id
  AND c.type = 'question'
  AND c.superseded_at IS NULL;
