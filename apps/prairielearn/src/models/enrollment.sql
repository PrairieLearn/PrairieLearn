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

-- BLOCK select_enrollment_by_uid
SELECT
  to_jsonb(e) AS enrollment
FROM
  enrollments AS e
  LEFT JOIN users AS u ON (u.id = e.user_id)
WHERE
  e.course_instance_id = $course_instance_id
  AND (
    e.pending_uid = $uid
    OR u.uid = $uid
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

-- BLOCK update_enrollments_to_removed_for_course
-- Updates all enrollments to 'removed' status for a user in all instances of a course.
-- Used when staff permissions are granted or removed at the course level.
-- Returns old and new row data for audit events.
WITH
  old_enrollments AS (
    SELECT
      e.*,
      ci.course_id AS ci_course_id
    FROM
      enrollments AS e
      JOIN course_instances AS ci ON (ci.id = e.course_instance_id)
    WHERE
      ci.course_id = $course_id
      AND e.user_id = $user_id
      AND e.status = 'joined'
    FOR NO KEY UPDATE OF
      e
  ),
  updated_enrollments AS (
    UPDATE enrollments AS e
    SET
      status = 'removed'
    FROM
      old_enrollments AS oe
    WHERE
      e.id = oe.id
    RETURNING
      e.*
  )
SELECT
  to_jsonb(oe.*) AS old_enrollment,
  to_jsonb(ue.*) AS new_enrollment,
  oe.ci_course_id AS course_id
FROM
  old_enrollments AS oe
  JOIN updated_enrollments AS ue ON (oe.id = ue.id);

-- BLOCK update_enrollments_to_removed_for_course_batch
-- Updates all enrollments to 'removed' status for multiple users in all instances of a course.
-- Used when staff permissions are removed for multiple users.
-- Returns old and new row data for audit events.
WITH
  old_enrollments AS (
    SELECT
      e.*,
      ci.course_id AS ci_course_id
    FROM
      enrollments AS e
      JOIN course_instances AS ci ON (ci.id = e.course_instance_id)
    WHERE
      ci.course_id = $course_id
      AND e.user_id = ANY ($user_ids::bigint[])
      AND e.status = 'joined'
    FOR NO KEY UPDATE OF
      e
  ),
  updated_enrollments AS (
    UPDATE enrollments AS e
    SET
      status = 'removed'
    FROM
      old_enrollments AS oe
    WHERE
      e.id = oe.id
    RETURNING
      e.*
  )
SELECT
  to_jsonb(oe.*) AS old_enrollment,
  to_jsonb(ue.*) AS new_enrollment,
  oe.ci_course_id AS course_id
FROM
  old_enrollments AS oe
  JOIN updated_enrollments AS ue ON (oe.id = ue.id);

-- BLOCK update_enrollment_to_removed_for_course_instance
-- Updates enrollment to 'removed' status for a user in a specific course instance.
-- Used when staff permissions are granted at the course instance level.
-- Returns old and new row data for audit events.
WITH
  old_enrollment AS (
    SELECT
      e.*
    FROM
      enrollments AS e
    WHERE
      e.course_instance_id = $course_instance_id
      AND e.user_id = $user_id
      AND e.status = 'joined'
    FOR NO KEY UPDATE OF
      e
  ),
  updated_enrollment AS (
    UPDATE enrollments AS e
    SET
      status = 'removed'
    FROM
      old_enrollment AS oe
    WHERE
      e.id = oe.id
    RETURNING
      e.*
  )
SELECT
  to_jsonb(oe.*) AS old_enrollment,
  to_jsonb(ue.*) AS new_enrollment
FROM
  old_enrollment AS oe
  JOIN updated_enrollment AS ue ON (oe.id = ue.id);
