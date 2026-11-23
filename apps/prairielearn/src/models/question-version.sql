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
  qv.id,
  qv.question_id,
  qv.source_hash,
  qv.dependency_hash,
  qv.uses_chunks,
  s.question_version_id IS NOT NULL
  AND (
    NOT qv.uses_chunks
    OR EXISTS (
      SELECT
        1
      FROM
        chunks AS c
      WHERE
        c.course_id = q.course_id
        AND c.question_id = qv.question_id
        AND c.type = 'question'
        AND NOT c.deleted
        AND c.created_at <= qv.created_at
        AND (
          c.superseded_at IS NULL
          OR c.superseded_at > qv.created_at
        )
    )
  ) AS complete
FROM
  question_versions AS qv
  JOIN questions AS q ON q.id = qv.question_id
  LEFT JOIN question_version_settings AS s ON s.question_version_id = qv.id
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
  versions AS (
    SELECT
      *
    FROM
      JSONB_TO_RECORDSET($versions::jsonb) AS v (
        question_id bigint,
        source_hash text,
        settings jsonb
      )
  ),
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
      question_id,
      source_hash,
      $dependency_hash,
      $commit_hash,
      $published_at::timestamptz,
      $uses_chunks
    FROM
      versions
    RETURNING
      id,
      question_id
  )
INSERT INTO
  question_version_settings
SELECT
  settings.*
FROM
  versions
  JOIN inserted_versions USING (question_id)
  CROSS JOIN LATERAL JSONB_POPULATE_RECORD(
    NULL::question_version_settings,
    versions.settings || JSONB_BUILD_OBJECT('question_version_id', inserted_versions.id)
  ) AS settings;
