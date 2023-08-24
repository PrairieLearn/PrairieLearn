-- BLOCK select
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
            'user_id',
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
            'jobs',
            coalesce(j.jobs, '{}'::jsonb)
          )
        ),
        '[]'::jsonb
      ) AS course_requests
    FROM
      course_requests AS r
      INNER JOIN users AS u ON u.user_id = r.user_id
      LEFT JOIN select_course_request_jobs AS j ON j.id = r.id
    WHERE
      r.approved_status != 'approved'
      AND r.approved_status != 'denied'
  ),
  select_courses AS (
    SELECT
      coalesce(
        jsonb_agg(
          jsonb_set(to_jsonb(c), '{institution}', to_jsonb(i))
          ORDER BY
            i.short_name,
            c.short_name,
            c.title,
            c.id
        ),
        '[]'::jsonb
      ) AS courses
    FROM
      pl_courses AS c
      JOIN institutions AS i ON (i.id = c.institution_id)
    WHERE
      c.deleted_at IS NULL
  ),
  select_institutions AS (
    SELECT
      coalesce(
        jsonb_agg(
          i
          ORDER BY
            i.short_name
        ),
        '[]'::jsonb
      ) AS institutions
    FROM
      institutions AS i
  )
SELECT
  course_requests,
  courses,
  institutions
FROM
  select_course_requests,
  select_courses,
  select_institutions;

-- BLOCK select_course
SELECT
  *
FROM
  pl_courses
WHERE
  id = $course_id;

-- BLOCK update_course_request
UPDATE course_requests
SET
  approved_by = $user_id,
  approved_status = $action
WHERE
  course_requests.id = $id;
