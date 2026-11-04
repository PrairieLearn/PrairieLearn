-- BLOCK select_questions_for_files
SELECT
  file_path,
  (
    SELECT
      to_jsonb(q.*)
    FROM
      questions AS q
    WHERE
      q.course_id = $course_id
      AND q.deleted_at IS NULL
      AND starts_with(file_path, 'questions/' || q.qid || '/')
    ORDER BY
      length(q.qid)
    LIMIT
      1
  ) AS question
FROM
  unnest($file_paths::text[]) AS files (file_path);

-- BLOCK question_identity_exists
SELECT
  EXISTS (
    SELECT
      1
    FROM
      questions
    WHERE
      course_id = $course_id
      AND (
        uuid = $uuid
        OR (
          qid = $qid
          AND deleted_at IS NULL
        )
      )
  );
