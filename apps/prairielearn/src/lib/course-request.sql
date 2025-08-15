-- BLOCK select_course_requests
WITH
  select_course_request_jobs AS (
    SELECT
      cr.id,
      count(js.start_date) AS num_jobs,
      jsonb_agg(
        jsonb_build_object(
          'start_date',
          js.start_date,
          'finish_date',
          js.finish_date,
          'authn_user_id',
          u.user_id,
          'authn_user_name',
          u.name,
          'status',
          js.status,
          'id',
          js.id,
          'number',
          js.number
        )
      ) AS jobs
    FROM
      course_requests AS cr
      JOIN job_sequences AS js ON cr.id = js.course_request_id
      LEFT JOIN users AS u ON js.authn_user_id = u.user_id
    GROUP BY
      cr.id
  )
SELECT
  r.id,
  r.short_name,
  r.title,
  u.name AS user_name,
  u.uid AS user_uid,
  r.github_user,
  r.first_name,
  r.last_name,
  r.work_email,
  r.institution,
  r.referral_source,
  r.approved_status,
  r.created_at,
  ua.name AS approved_by_name,
  coalesce(j.jobs, '[]'::jsonb) AS jobs
FROM
  course_requests AS r
  INNER JOIN users AS u ON u.user_id = r.user_id
  LEFT JOIN users AS ua on ua.user_id = r.approved_by
  LEFT JOIN select_course_request_jobs AS j ON j.id = r.id
WHERE
  $show_all = 'true'
  OR r.approved_status NOT IN ('approved', 'denied')
ORDER BY
  r.created_at DESC,
  r.id DESC;

-- BLOCK update_course_request
UPDATE course_requests
SET
  approved_by = $user_id,
  approved_status = $action
WHERE
  course_requests.id = $id;
