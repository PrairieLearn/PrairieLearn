-- BLOCK select_sync_job_sequences
SELECT
  js.*,
  u.uid AS user_uid
FROM
  job_sequences AS js
  LEFT JOIN users AS u on (u.user_id = js.user_id)
WHERE
  js.course_id = $course_id
  AND js.type IN ('sync', 'git_status', 'images_sync')
ORDER BY
  js.start_date DESC,
  js.id;

-- BLOCK question_images
WITH
  questions_list AS (
    SELECT
      *
    FROM
      questions
    WHERE
      course_id = $course_id
      AND deleted_at IS NULL
  ),
  questions_and_images AS (
    SELECT
      id,
      qid,
      external_grading_image AS image
    FROM
      questions_list
    WHERE
      external_grading_image IS NOT NULL
    UNION
    SELECT
      id,
      qid,
      workspace_image AS image
    FROM
      questions_list
    WHERE
      workspace_image IS NOT NULL
  )
SELECT
  image,
  coalesce(
    jsonb_agg(
      jsonb_build_object('id', id, 'qid', qid)
      ORDER BY
        qid
    ),
    '[]'::jsonb
  ) AS questions
FROM
  questions_and_images
GROUP BY
  image
ORDER BY
  image;

-- BLOCK check_question_with_image
SELECT
  id
FROM
  questions
WHERE
  course_id = $course_id
  AND deleted_at IS NULL
  AND (
    external_grading_image = $image
    OR workspace_image = $image
  )
LIMIT
  1;
