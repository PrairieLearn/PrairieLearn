-- BLOCK ensure_enrollment
INSERT INTO
  enrollments (
    user_id,
    course_instance_id,
    status,
    first_joined_at
  )
VALUES
  ($user_id, $course_instance_id, 'joined', now())
ON CONFLICT DO NOTHING
RETURNING
  *;

-- BLOCK enroll_user
UPDATE enrollments
SET
  status = 'joined',
  user_id = $user_id,
  pending_uid = NULL,
  first_joined_at = COALESCE(first_joined_at, now())
WHERE
  id = $enrollment_id
RETURNING
  *;

-- BLOCK select_enrollment_by_pending_uid
SELECT
  *
FROM
  enrollments
WHERE
  pending_uid = $pending_uid
  AND course_instance_id = $course_instance_id;

-- BLOCK select_enrollment_by_user_id
SELECT
  *
FROM
  enrollments
WHERE
  user_id = $user_id
  AND course_instance_id = $course_instance_id;

-- BLOCK select_enrollment_by_id
SELECT
  *
FROM
  enrollments
WHERE
  id = $id;

-- BLOCK select_enrollments_by_ids_in_course_instance
SELECT
  *
FROM
  enrollments
WHERE
  id = ANY ($ids::bigint[])
  AND course_instance_id = $course_instance_id;

-- BLOCK select_enrollment_by_uid
SELECT
  e.*
FROM
  enrollments AS e
  LEFT JOIN users AS u ON (u.id = e.user_id)
WHERE
  e.course_instance_id = $course_instance_id
  AND (
    e.pending_uid = $uid
    OR u.uid = $uid
  );

-- BLOCK select_enrollments_by_uids_or_pending_uids
SELECT
  to_jsonb(e) AS enrollment,
  COALESCE(u.uid, e.pending_uid) AS uid
FROM
  enrollments AS e
  LEFT JOIN users AS u ON (u.id = e.user_id)
WHERE
  e.course_instance_id = $course_instance_id
  AND (
    u.uid = ANY ($uids::text[])
    OR e.pending_uid = ANY ($uids::text[])
  );

-- BLOCK select_enrollments_by_uids_in_course_instance
SELECT
  to_jsonb(e) AS enrollment,
  to_jsonb(u) AS user
FROM
  enrollments AS e
  JOIN users AS u ON (u.id = e.user_id)
WHERE
  u.uid = ANY ($uids::text[])
  AND e.course_instance_id = $course_instance_id;

-- BLOCK invite_existing_enrollment
UPDATE enrollments
SET
  status = 'invited',
  user_id = NULL,
  pending_uid = $pending_uid
WHERE
  id = $enrollment_id
RETURNING
  *;

-- BLOCK invite_new_enrollment
INSERT INTO
  enrollments (course_instance_id, status, pending_uid)
VALUES
  ($course_instance_id, 'invited', $pending_uid)
RETURNING
  *;

-- BLOCK select_and_lock_enrollment_by_id
SELECT
  *
FROM
  enrollments
WHERE
  id = $id
FOR NO KEY UPDATE;

-- BLOCK set_enrollment_status
UPDATE enrollments
SET
  status = $status
WHERE
  id = $enrollment_id
RETURNING
  *;

-- BLOCK delete_enrollment_by_id
DELETE FROM enrollments
WHERE
  id = $enrollment_id
RETURNING
  *;

-- BLOCK recompute_enrollment_for_staff_status
-- For a single user, ensures that any enrollment in a course instance where
-- they are currently staff is not in an active student state:
--   joined / blocked   -> 'removed'
--   invited / rejected -> hard-deleted
--   left / removed / lti13_pending / no row -> no-op
--
-- Pass a course_instance_id to scope to a single course instance; pass NULL
-- to consider every course instance in the course.
--
-- Returns one row per modified enrollment. new_enrollment is null for deletes.
WITH
  user_info AS (
    SELECT
      u.id,
      u.uid
    FROM
      users AS u
    WHERE
      u.id = $user_id
  ),
  scoped_course_instances AS (
    SELECT
      ci.id
    FROM
      course_instances AS ci
    WHERE
      ci.course_id = $course_id
      AND (
        $course_instance_id::bigint IS NULL
        OR ci.id = $course_instance_id::bigint
      )
  ),
  staff_course_instances AS (
    SELECT
      sci.id
    FROM
      scoped_course_instances AS sci,
      user_info AS ui
    WHERE
      users_is_instructor_in_course_instance (ui.id, sci.id)
  ),
  candidate_enrollments AS (
    SELECT
      e.*
    FROM
      enrollments AS e
      JOIN staff_course_instances AS sci ON (sci.id = e.course_instance_id),
      user_info AS ui
    WHERE
      e.user_id = ui.id
      OR e.pending_uid = ui.uid
    FOR NO KEY UPDATE OF
      e
  ),
  updated_enrollments AS (
    UPDATE enrollments AS e
    SET
      status = 'removed'
    FROM
      candidate_enrollments AS ce
    WHERE
      e.id = ce.id
      AND ce.status IN ('joined', 'blocked')
    RETURNING
      e.*
  ),
  deleted_enrollments AS (
    DELETE FROM enrollments AS e USING candidate_enrollments AS ce
    WHERE
      e.id = ce.id
      AND ce.status IN ('invited', 'rejected')
    RETURNING
      e.*
  )
SELECT
  to_jsonb(ce.*) AS old_enrollment,
  to_jsonb(ue.*) AS new_enrollment
FROM
  candidate_enrollments AS ce
  LEFT JOIN updated_enrollments AS ue ON (ce.id = ue.id)
  LEFT JOIN deleted_enrollments AS de ON (ce.id = de.id)
WHERE
  ue.id IS NOT NULL
  OR de.id IS NOT NULL;

-- BLOCK select_users_and_enrollments_for_course_instance
WITH
  student_label_agg AS (
    SELECT
      sle.enrollment_id,
      jsonb_agg(
        sle.student_label_id
        ORDER BY
          sle.student_label_id
      ) AS student_label_ids
    FROM
      student_label_enrollments AS sle
      JOIN enrollments AS e ON e.id = sle.enrollment_id
    WHERE
      e.course_instance_id = $course_instance_id
    GROUP BY
      sle.enrollment_id
  )
SELECT
  to_jsonb(u) AS user,
  to_jsonb(e) AS enrollment,
  COALESCE(sla.student_label_ids, '[]'::jsonb) AS student_label_ids,
  CASE
    WHEN u.id IS NOT NULL THEN users_get_displayed_role (u.id, e.course_instance_id)
    ELSE 'None'
  END AS role
FROM
  enrollments AS e
  LEFT JOIN users AS u ON (u.id = e.user_id)
  LEFT JOIN student_label_agg sla ON sla.enrollment_id = e.id
WHERE
  e.course_instance_id = $course_instance_id
ORDER BY
  COALESCE(u.uid, e.pending_uid) ASC;

-- BLOCK validate_enrollment_ids_in_course_instance
SELECT
  count(*)::integer
FROM
  enrollments
WHERE
  id = ANY ($enrollment_ids::bigint[])
  AND course_instance_id = $course_instance_id;
