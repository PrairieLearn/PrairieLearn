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
          u.id,
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
      LEFT JOIN users AS u ON js.authn_user_id = u.id
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
  r.note,
  r.work_email,
  r.institution,
  r.referral_source,
  r.approved_status,
  r.created_at,
  ua.name AS approved_by_name,
  coalesce(j.jobs, '[]'::jsonb) AS jobs
FROM
  course_requests AS r
  INNER JOIN users AS u ON u.id = r.user_id
  LEFT JOIN users AS ua ON ua.id = r.approved_by
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
  course_requests.id = $id
RETURNING
  course_requests.id;

-- BLOCK insert_course_request
INSERT INTO
  course_requests (
    short_name,
    title,
    user_id,
    github_user,
    first_name,
    last_name,
    work_email,
    institution,
    referral_source,
    approved_status
  )
VALUES
  (
    $short_name,
    $title,
    $user_id,
    $github_user,
    $first_name,
    $last_name,
    $work_email,
    $institution,
    $referral_source,
    'pending'
  )
RETURNING
  course_requests.id;

-- BLOCK update_course_request_note
UPDATE course_requests
SET
  note = $note
WHERE
  course_requests.id = $id;

-- BLOCK get_existing_course_requests
SELECT
  EXISTS (
    SELECT
      cr.*
    FROM
      course_requests AS cr
    WHERE
      cr.user_id = $user_id
      AND LOWER(BTRIM(cr.short_name)) = LOWER(BTRIM($short_name))
  ) AS has_existing_request;

-- BLOCK get_existing_owner_course_settings
SELECT
  co.institution_id,
  co.display_timezone
FROM
  course_permissions AS cp
  JOIN courses AS co ON co.id = cp.course_id
WHERE
  (
    cp.user_id = $user_id
    AND (
      cp.course_role = 'Owner'
      OR cp.course_role = 'Editor'
    )
  )
LIMIT
  1;

-- BLOCK can_auto_create_course
SELECT
  (
    -- The usert must have pre-existing edit/owner permissions
    EXISTS (
      SELECT
        TRUE
      FROM
        course_permissions AS cp
      WHERE
        cp.user_id = $user_id
        AND (
          cp.course_role = 'Owner'
          OR cp.course_role = 'Editor'
        )
    )
    -- The user must not have more that 3 requests in the past 24 hours
    AND NOT EXISTS (
      SELECT
        TRUE
      FROM
        course_requests AS cr
      WHERE
        cr.user_id = $user_id
        AND cr.approved_status = 'denied'
    )
    AND (count(*) < 3)
  ) AS can_auto_create_course
FROM
  course_requests AS cr
WHERE
  cr.user_id = $user_id
  AND cr.created_at BETWEEN NOW() - interval '24 HOURS' AND NOW();
