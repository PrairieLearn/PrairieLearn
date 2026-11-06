-- BLOCK select_course_chunks
WITH
  latest_chunks AS (
    SELECT DISTINCT
      ON (
        type,
        coalesce(question_id, -1),
        coalesce(course_instance_id, -1),
        coalesce(assessment_id, -1)
      ) *
    FROM
      chunks
    WHERE
      course_id = $course_id
      -- Undated rows predate history and remain current until a newer revision.
      AND (
        $at_date::timestamptz IS NULL
        OR created_at IS NULL
        OR created_at <= $at_date
      )
    ORDER BY
      type ASC,
      coalesce(question_id, -1) ASC,
      coalesce(course_instance_id, -1) ASC,
      coalesce(assessment_id, -1) ASC,
      id DESC
  )
SELECT
  chunks.*,
  q.uuid AS question_uuid,
  q.qid AS question_name,
  a.uuid AS assessment_uuid,
  a.tid AS assessment_name,
  ci.uuid AS course_instance_uuid,
  ci.short_name AS course_instance_name
FROM
  latest_chunks AS chunks
  LEFT JOIN assessments AS a ON (a.id = chunks.assessment_id)
  LEFT JOIN course_instances AS ci ON (
    ci.id = chunks.course_instance_id
    OR ci.id = a.course_instance_id
  )
  LEFT JOIN questions AS q ON (q.id = chunks.question_id)
WHERE
  NOT chunks.deleted;

-- BLOCK select_metadata_for_chunks
-- A lateral lookup stops at the newest indexed revision for each request.
-- noqa: disable=ST05
SELECT
  chunks.*,
  (chunks_arr ->> 'type')::enum_chunk_type AS type,
  q.qid AS question_name,
  a.tid AS assessment_name,
  ci.short_name AS course_instance_name
FROM
  JSONB_ARRAY_ELEMENTS($chunks_arr::jsonb) AS chunks_arr
  -- Preserve missing/deleted requests so consumers can remove their runtime paths.
  LEFT JOIN LATERAL (
    SELECT
      *
    FROM
      chunks
    WHERE
      course_id = $course_id
      AND type = (chunks_arr ->> 'type')::enum_chunk_type
      AND coalesce(question_id, -1) = coalesce((chunks_arr ->> 'questionId')::bigint, -1)
      AND coalesce(course_instance_id, -1) = coalesce((chunks_arr ->> 'courseInstanceId')::bigint, -1)
      AND coalesce(assessment_id, -1) = coalesce((chunks_arr ->> 'assessmentId')::bigint, -1)
    ORDER BY
      id DESC
    LIMIT
      1
  ) AS chunks ON NOT chunks.deleted
  LEFT JOIN assessments AS a ON (a.id = (chunks_arr ->> 'assessmentId')::bigint)
  LEFT JOIN course_instances AS ci ON (
    ci.id = (chunks_arr ->> 'courseInstanceId')::bigint
    OR ci.id = a.course_instance_id
  )
  LEFT JOIN questions AS q ON (q.id = (chunks_arr ->> 'questionId')::bigint);

-- noqa: enable=ST05
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

-- BLOCK insert_chunks
WITH
  publication AS MATERIALIZED (
    SELECT
      clock_timestamp() AS created_at
  ),
  new_chunks AS (
    SELECT
      (chunk ->> 'type')::enum_chunk_type AS type,
      $course_id::bigint AS course_id,
      q.id AS question_id,
      ci.id AS course_instance_id,
      a.id AS assessment_id,
      (chunk ->> 'uuid')::uuid AS uuid,
      (chunk ->> 'sizeCompressed')::bigint AS size_compressed,
      (chunk ->> 'sizeUncompressed')::bigint AS size_uncompressed
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
  )
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
    deleted,
    size_compressed,
    size_uncompressed
  )
SELECT
  type,
  course_id,
  question_id,
  course_instance_id,
  assessment_id,
  uuid,
  publication.created_at,
  $commit_hash,
  FALSE,
  size_compressed,
  size_uncompressed
FROM
  new_chunks
  CROSS JOIN publication
UNION ALL
SELECT
  old.type,
  old.course_id,
  old.question_id,
  old.course_instance_id,
  old.assessment_id,
  NULL::uuid,
  publication.created_at,
  $commit_hash,
  TRUE,
  NULL::bigint,
  NULL::bigint
FROM
  chunks AS old
  CROSS JOIN publication
WHERE
  old.course_id = $course_id
  AND old.id = ANY ($replaced_chunk_ids::bigint[])
  -- A regenerated path can belong to a new entity ID. Mark the old identity
  -- deleted as well, while ordinary updates only append the new live revision.
  AND NOT EXISTS (
    SELECT
      1
    FROM
      new_chunks AS new
    WHERE
      new.type = old.type
      AND coalesce(new.question_id, -1) = coalesce(old.question_id, -1)
      AND coalesce(new.course_instance_id, -1) = coalesce(old.course_instance_id, -1)
      AND coalesce(new.assessment_id, -1) = coalesce(old.assessment_id, -1)
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
