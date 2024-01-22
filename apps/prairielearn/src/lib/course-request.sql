-- BLOCK get_requests
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
  ),
  select_course_requests AS (
    SELECT
      coalesce(
        jsonb_agg(
          jsonb_build_object(
            'id',
            r.id,
            'short_name',
            r.short_name,
            'title',
            r.title,
            'user_name',
            u.name,
            'user_uid',
            u.uid,
            'github_user',
            r.github_user,
            'first_name',
            r.first_name,
            'last_name',
            r.last_name,
            'work_email',
            r.work_email,
            'institution',
            r.institution,
            'status',
            r.approved_status,
            'approved_by_name',
            ua.name,
            'jobs',
            coalesce(j.jobs, '[]'::jsonb)
          )
        ),
        '[]'::jsonb
      ) AS course_requests
    FROM
      course_requests AS r
      INNER JOIN users AS u ON u.user_id = r.user_id
      LEFT JOIN users AS ua on ua.user_id = r.approved_by
      LEFT JOIN select_course_request_jobs AS j ON j.id = r.id
    WHERE
      $show_all = 'true'
      OR r.approved_status NOT IN ('approved', 'denied')
  )
SELECT
  course_requests
FROM
  select_course_requests;

-- BLOCK update_course_request
UPDATE course_requests
SET
  approved_by = $user_id,
  approved_status = $action
WHERE
  course_requests.id = $id;
