-- BLOCK select_course_chunks
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
  chunks.course_id = $course_id;

-- BLOCK select_metadata_for_chunks
SELECT
  chunks.*,
  (chunks_arr ->> 'type')::enum_chunk_type AS type,
  q.qid AS question_name,
  a.tid AS assessment_name,
  ci.short_name AS course_instance_name
FROM
  JSON_ARRAY_ELEMENTS($chunks_arr::json) AS chunks_arr
  -- Note that we specifically use a LEFT JOIN here - this is what allows the
  -- caller to differentiate between a chunk that exists and one that does not.
  -- Chunks that don't exist will have a NULL id, but they'll still contain
  -- other information like the course instance/assessment/question name so that
  -- we can clean up unused chunks from disk.
  LEFT JOIN chunks ON (
    chunks.course_id = ($course_id)::bigint
    AND chunks.type = (chunks_arr ->> 'type')::enum_chunk_type
    AND (
      (chunks_arr ->> 'courseInstanceId' IS NULL)
      OR (
        chunks.course_instance_id = (chunks_arr ->> 'courseInstanceId')::bigint
      )
    )
    AND (
      (chunks_arr ->> 'assessmentId' IS NULL)
      OR (
        chunks.assessment_id = (chunks_arr ->> 'assessmentId')::bigint
      )
    )
    AND (
      (chunks_arr ->> 'questionId' IS NULL)
      OR (
        chunks.question_id = (chunks_arr ->> 'questionId')::bigint
      )
    )
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
  pl_courses AS c
WHERE
  c.id = $course_id;

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

-- LIMIT prevents infinite recursion on circular templates
-- BLOCK insert_chunks
INSERT INTO
  chunks (
    type,
    course_id,
    question_id,
    course_instance_id,
    assessment_id,
    uuid
  )
SELECT
  (chunk ->> 'type')::enum_chunk_type,
  $course_id,
  q.id,
  ci.id,
  a.id,
  (chunk ->> 'uuid')::uuid
FROM
  JSON_ARRAY_ELEMENTS($chunks) AS chunk (json)
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
ON CONFLICT (
  type,
  course_id,
  coalesce(question_id, -1),
  coalesce(course_instance_id, -1),
  coalesce(assessment_id, -1)
) DO
UPDATE
SET
  type = EXCLUDED.type,
  question_id = EXCLUDED.question_id,
  course_instance_id = EXCLUDED.course_instance_id,
  assessment_id = EXCLUDED.assessment_id,
  uuid = EXCLUDED.uuid;

-- BLOCK delete_chunks
WITH
  chunks_metadata AS (
    SELECT
      (cm ->> 'type')::enum_chunk_type AS type,
      q.id AS question_id,
      ci.id AS course_instance_id,
      a.id AS assessment_id,
      (cm ->> 'uuid')::uuid AS uuid
    FROM
      JSON_ARRAY_ELEMENTS($chunks) AS cm
      LEFT JOIN questions AS q ON (
        q.qid = (cm ->> 'questionName')
        AND q.course_id = $course_id
      )
      LEFT JOIN course_instances AS ci ON (
        ci.short_name = (cm ->> 'courseInstanceName')
        AND ci.course_id = $course_id
      )
      LEFT JOIN assessments AS a ON (
        a.tid = (cm ->> 'assessmentName')
        AND a.course_instance_id = ci.id
      )
  ),
  -- We use separate queries for each chunk type so that Postgres doesn't try to
  -- compute a huge cross product of the chunks + metadata on `type` as an
  -- intermediate step. This was O(n^2) with the number of chunks to delete.
  chunks_to_delete AS (
    (
      SELECT
        id
      FROM
        chunks
        JOIN chunks_metadata AS cm ON (
          cm.type = chunks.type
          AND cm.question_id = chunks.question_id
        )
      WHERE
        chunks.course_id = $course_id
        AND chunks.type = 'question'
    )
    UNION
    (
      SELECT
        id
      FROM
        chunks
        JOIN chunks_metadata AS cm ON (
          cm.type = chunks.type
          AND cm.course_instance_id = chunks.course_instance_id
        )
      WHERE
        chunks.course_id = $course_id
        AND chunks.type = 'clientFilesCourseInstance'
    )
    UNION
    (
      SELECT
        id
      FROM
        chunks
        JOIN chunks_metadata AS cm ON (
          cm.type = chunks.type
          AND cm.assessment_id = chunks.assessment_id
        )
      WHERE
        chunks.course_id = $course_id
        AND chunks.type = 'clientFilesAssessment'
    )
    UNION
    (
      SELECT
        id
      FROM
        chunks
        JOIN chunks_metadata AS cm ON (cm.type = chunks.type)
      WHERE
        chunks.course_id = $course_id
        AND cm.type IN (
          'elements',
          'elementExtensions',
          'clientFilesCourse',
          'serverFilesCourse'
        )
    )
  )
DELETE FROM chunks
WHERE
  id IN (
    SELECT
      id
    FROM
      chunks_to_delete
  );
