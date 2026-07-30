-- BLOCK deduplicate_student_label_enrollments
WITH
  ranked_memberships AS (
    SELECT
      id,
      row_number() OVER (
        PARTITION BY
          student_label_id
        ORDER BY
          (enrollment_id = $survivor_enrollment_id::bigint) DESC,
          id
      ) AS membership_rank
    FROM
      student_label_enrollments
    WHERE
      enrollment_id = ANY ($enrollment_ids::bigint[])
  )
DELETE FROM student_label_enrollments AS membership USING ranked_memberships AS ranked
WHERE
  membership.id = ranked.id
  AND ranked.membership_rank > 1;

-- BLOCK move_student_label_enrollments
UPDATE student_label_enrollments
SET
  enrollment_id = $survivor_enrollment_id
WHERE
  enrollment_id = ANY ($enrollment_ids::bigint[])
  AND enrollment_id <> $survivor_enrollment_id;

-- Publishing extensions are mutually exclusive for reconciliation. Prefer the
-- latest end date, with the extension ID as a deterministic tie-breaker.
-- BLOCK keep_best_publishing_extension_enrollment
WITH
  ranked_memberships AS (
    SELECT
      extension_enrollment.id,
      row_number() OVER (
        ORDER BY
          extension.end_date DESC,
          extension.id DESC,
          (
            extension_enrollment.enrollment_id = $survivor_enrollment_id::bigint
          ) DESC,
          extension_enrollment.id
      ) AS membership_rank
    FROM
      course_instance_publishing_extension_enrollments AS extension_enrollment
      JOIN course_instance_publishing_extensions AS extension ON (
        extension.id = extension_enrollment.course_instance_publishing_extension_id
      )
    WHERE
      extension_enrollment.enrollment_id = ANY ($enrollment_ids::bigint[])
  )
DELETE FROM course_instance_publishing_extension_enrollments AS membership USING ranked_memberships AS ranked
WHERE
  membership.id = ranked.id
  AND ranked.membership_rank > 1;

-- BLOCK move_publishing_extension_enrollment
UPDATE course_instance_publishing_extension_enrollments
SET
  enrollment_id = $survivor_enrollment_id
WHERE
  enrollment_id = ANY ($enrollment_ids::bigint[])
  AND enrollment_id <> $survivor_enrollment_id;

-- BLOCK deduplicate_assessment_access_control_enrollments
WITH
  ranked_references AS (
    SELECT
      id,
      row_number() OVER (
        PARTITION BY
          assessment_access_control_rule_id
        ORDER BY
          (enrollment_id = $survivor_enrollment_id::bigint) DESC,
          id
      ) AS reference_rank
    FROM
      assessment_access_control_enrollments
    WHERE
      enrollment_id = ANY ($enrollment_ids::bigint[])
  )
DELETE FROM assessment_access_control_enrollments AS reference USING ranked_references AS ranked
WHERE
  reference.id = ranked.id
  AND ranked.reference_rank > 1;

-- BLOCK move_assessment_access_control_enrollments
UPDATE assessment_access_control_enrollments
SET
  enrollment_id = $survivor_enrollment_id
WHERE
  enrollment_id = ANY ($enrollment_ids::bigint[])
  AND enrollment_id <> $survivor_enrollment_id;

-- Admission deliberately binds the user, clears every pending identity field,
-- and transitions to joined in one statement.
-- BLOCK admit_reconciled_enrollment
UPDATE enrollments
SET
  status = 'joined',
  user_id = $user_id,
  pending_uid = NULL,
  pending_uin = NULL,
  pending_name = NULL,
  pending_email = NULL,
  pending_lti13_sub = NULL,
  pending_lti13_course_instance_id = NULL,
  is_guest = $is_guest,
  first_joined_at = COALESCE($first_joined_at::timestamptz, now())
WHERE
  id = $enrollment_id
RETURNING
  *;

-- BLOCK insert_joined_enrollment
INSERT INTO
  enrollments (
    course_instance_id,
    first_joined_at,
    is_guest,
    status,
    user_id
  )
VALUES
  (
    $course_instance_id,
    now(),
    FALSE,
    'joined',
    $user_id
  )
RETURNING
  *;

-- BLOCK reject_uid_invitation
UPDATE enrollments
SET
  status = 'rejected'
WHERE
  id = $enrollment_id
  AND status = 'invited'
RETURNING
  *;

-- BLOCK delete_loser_enrollments
DELETE FROM enrollments
WHERE
  id = ANY ($loser_enrollment_ids::bigint[])
RETURNING
  *;
