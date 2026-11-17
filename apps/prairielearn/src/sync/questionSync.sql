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

-- BLOCK question_identity_or_path_exists
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
          deleted_at IS NULL
          AND (
            qid = $qid
            OR starts_with($qid, qid || '/')
            OR starts_with(qid, $qid || '/')
          )
        )
      )
  );

-- BLOCK select_question_qids_without_uuid
SELECT
  qid
FROM
  questions
WHERE
  course_id = $course_id
  AND deleted_at IS NULL
  AND qid IS NOT NULL
  AND uuid IS NULL;
