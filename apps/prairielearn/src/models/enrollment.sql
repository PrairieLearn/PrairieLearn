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
  COALESCE(sla.student_label_ids, '[]'::jsonb) AS student_label_ids
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
