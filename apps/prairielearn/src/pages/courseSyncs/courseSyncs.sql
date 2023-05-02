-- BLOCK select_sync_job_sequences
SELECT
  js.*,
  format_date_full_compact (js.start_date, c.display_timezone) AS start_date_formatted,
  u.uid AS user_uid
FROM
  job_sequences AS js
  JOIN pl_courses AS c ON (c.id = js.course_id)
  JOIN users AS u on (u.user_id = js.user_id)
WHERE
  c.id = $course_id
  AND (
    js.type = 'sync'
    OR js.type = 'git_status'
    OR js.type = 'images_sync'
  )
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

-- BLOCK format_pushed_at
SELECT
  format_date_full_compact (pushed_at::timestamptz, c.display_timezone) AS pushed_at_formatted
FROM
  unnest($pushed_at_array::timestamptz[]) AS pushed_at
  JOIN pl_courses AS c ON (c.id = $course_id);
