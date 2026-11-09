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
  publication AS (
    SELECT
      clock_timestamp() AS created_at
  ),
  superseded AS (
    UPDATE chunks
    SET
      superseded_at = publication.created_at
    FROM
      publication
    WHERE
      course_id = $course_id
      AND id = ANY ($chunk_ids::bigint[])
      AND superseded_at IS NULL
  )
SELECT
  created_at
FROM
  publication;

-- BLOCK insert_chunks
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
  );

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
