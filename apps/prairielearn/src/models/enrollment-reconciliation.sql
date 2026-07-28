-- Candidate selection is intentionally read-only. In particular, it never locks
-- users, lti13_users, or lti13_course_instances. A caller that supplies an LTI
-- identity only gets LTI provenance when that exact link belongs to the requested
-- PrairieLearn course instance.
-- BLOCK select_enrollment_identity_candidates
WITH
  identity AS (
    SELECT
      u.id AS user_id,
      u.uid,
      u.uin,
      u.institution_id = c.institution_id AS institution_matches,
      EXISTS (
        SELECT
          1
        FROM
          lti13_course_instances AS lti_ci
        WHERE
          lti_ci.id = $lti13_course_instance_id
          AND lti_ci.course_instance_id = ci.id
      ) AS lti13_course_instance_matches
    FROM
      users AS u
      JOIN course_instances AS ci ON (ci.id = $course_instance_id)
      JOIN courses AS c ON (c.id = ci.course_id)
    WHERE
      u.id = $user_id
  ),
  candidate_matches AS (
    SELECT
      to_jsonb(e.*) AS enrollment,
      coalesce(e.user_id = identity.user_id, FALSE) AS matches_bound_user,
      coalesce(e.pending_uid = identity.uid, FALSE) AS matches_pending_uid,
      coalesce(
        identity.institution_matches
        AND identity.uin IS NOT NULL
        AND e.pending_uin = identity.uin,
        FALSE
      ) AS matches_institution_uin,
      coalesce(
        $lti13_course_instance_id::bigint IS NOT NULL
        AND $lti13_sub::text IS NOT NULL
        AND identity.lti13_course_instance_matches
        AND e.pending_lti13_course_instance_id = $lti13_course_instance_id
        AND e.pending_lti13_sub = $lti13_sub,
        FALSE
      ) AS matches_lti13
    FROM
      enrollments AS e
      CROSS JOIN identity
    WHERE
      e.course_instance_id = $course_instance_id
  )
SELECT
  *
FROM
  candidate_matches
WHERE
  matches_bound_user
  OR matches_pending_uid
  OR matches_institution_uin
  OR matches_lti13
ORDER BY
  (enrollment ->> 'id')::bigint;

-- Revalidates only rows whose parents were locked by the caller. User identity
-- fields and LTI link ownership may change rarely and are deliberately not
-- locked; a later reconciliation will pick up identities that change after this
-- final read.
-- BLOCK revalidate_locked_enrollment_identity_candidates
WITH
  identity AS (
    SELECT
      u.id AS user_id,
      u.uid,
      u.uin,
      u.institution_id = c.institution_id AS institution_matches,
      EXISTS (
        SELECT
          1
        FROM
          lti13_course_instances AS lti_ci
        WHERE
          lti_ci.id = $lti13_course_instance_id
          AND lti_ci.course_instance_id = ci.id
      ) AS lti13_course_instance_matches
    FROM
      users AS u
      JOIN course_instances AS ci ON (ci.id = $course_instance_id)
      JOIN courses AS c ON (c.id = ci.course_id)
    WHERE
      u.id = $user_id
  ),
  candidate_matches AS (
    SELECT
      to_jsonb(e.*) AS enrollment,
      coalesce(e.user_id = identity.user_id, FALSE) AS matches_bound_user,
      coalesce(e.pending_uid = identity.uid, FALSE) AS matches_pending_uid,
      coalesce(
        identity.institution_matches
        AND identity.uin IS NOT NULL
        AND e.pending_uin = identity.uin,
        FALSE
      ) AS matches_institution_uin,
      coalesce(
        $lti13_course_instance_id::bigint IS NOT NULL
        AND $lti13_sub::text IS NOT NULL
        AND identity.lti13_course_instance_matches
        AND e.pending_lti13_course_instance_id = $lti13_course_instance_id
        AND e.pending_lti13_sub = $lti13_sub,
        FALSE
      ) AS matches_lti13
    FROM
      enrollments AS e
      CROSS JOIN identity
    WHERE
      e.course_instance_id = $course_instance_id
      AND e.id = ANY ($enrollment_ids::bigint[])
  )
SELECT
  *
FROM
  candidate_matches
WHERE
  matches_bound_user
  OR matches_pending_uid
  OR matches_institution_uin
  OR matches_lti13
ORDER BY
  (enrollment ->> 'id')::bigint;

-- Enrollment-dependent rows are always locked after their enrollment parents,
-- in this fixed table order:
-- 1. student_label_enrollments
-- 2. course_instance_publishing_extension_enrollments
-- 3. assessment_access_control_enrollments
-- BLOCK lock_student_label_enrollments
SELECT
  id
FROM
  student_label_enrollments
WHERE
  enrollment_id = ANY ($enrollment_ids::bigint[])
ORDER BY
  student_label_id,
  id
FOR UPDATE;

-- BLOCK lock_publishing_extension_enrollments
SELECT
  id
FROM
  course_instance_publishing_extension_enrollments
WHERE
  enrollment_id = ANY ($enrollment_ids::bigint[])
ORDER BY
  course_instance_publishing_extension_id,
  id
FOR UPDATE;

-- BLOCK lock_assessment_access_control_enrollments
SELECT
  id
FROM
  assessment_access_control_enrollments
WHERE
  enrollment_id = ANY ($enrollment_ids::bigint[])
ORDER BY
  assessment_access_control_rule_id,
  id
FOR UPDATE;

-- Dependent rows are moved in the same fixed order used above.
-- BLOCK union_student_label_enrollments
INSERT INTO
  student_label_enrollments (enrollment_id, student_label_id)
SELECT DISTINCT
  $survivor_enrollment_id::bigint,
  student_label_id
FROM
  student_label_enrollments
WHERE
  enrollment_id = ANY ($enrollment_ids::bigint[])
ON CONFLICT (enrollment_id, student_label_id) DO NOTHING;

-- BLOCK delete_loser_student_label_enrollments
DELETE FROM student_label_enrollments
WHERE
  enrollment_id = ANY ($loser_enrollment_ids::bigint[]);

-- Publishing extensions are mutually exclusive for reconciliation. Prefer the
-- latest end date, with the extension ID as a deterministic tie-breaker.
-- BLOCK select_best_publishing_extension_id
SELECT
  extension.id
FROM
  course_instance_publishing_extension_enrollments AS extension_enrollment
  JOIN course_instance_publishing_extensions AS extension ON (
    extension.id = extension_enrollment.course_instance_publishing_extension_id
  )
WHERE
  extension_enrollment.enrollment_id = ANY ($enrollment_ids::bigint[])
ORDER BY
  extension.end_date DESC,
  extension.id DESC
LIMIT
  1;

-- BLOCK delete_candidate_publishing_extension_enrollments
DELETE FROM course_instance_publishing_extension_enrollments
WHERE
  enrollment_id = ANY ($enrollment_ids::bigint[]);

-- BLOCK insert_survivor_publishing_extension_enrollment
INSERT INTO
  course_instance_publishing_extension_enrollments (
    course_instance_publishing_extension_id,
    enrollment_id
  )
VALUES
  (
    $publishing_extension_id::bigint,
    $survivor_enrollment_id::bigint
  )
ON CONFLICT (
  enrollment_id,
  course_instance_publishing_extension_id
) DO NOTHING;

-- BLOCK union_assessment_access_control_enrollments
INSERT INTO
  assessment_access_control_enrollments (assessment_access_control_rule_id, enrollment_id)
SELECT DISTINCT
  assessment_access_control_rule_id,
  $survivor_enrollment_id::bigint
FROM
  assessment_access_control_enrollments
WHERE
  enrollment_id = ANY ($enrollment_ids::bigint[])
ON CONFLICT (assessment_access_control_rule_id, enrollment_id) DO NOTHING;

-- BLOCK delete_loser_assessment_access_control_enrollments
DELETE FROM assessment_access_control_enrollments
WHERE
  enrollment_id = ANY ($loser_enrollment_ids::bigint[]);

-- BLOCK update_reconciled_enrollment
UPDATE enrollments
SET
  status = $status,
  is_guest = $is_guest,
  first_joined_at = $first_joined_at,
  pending_uid = $pending_uid,
  pending_uin = $pending_uin,
  pending_name = $pending_name,
  pending_email = $pending_email,
  pending_lti13_course_instance_id = $pending_lti13_course_instance_id,
  pending_lti13_sub = $pending_lti13_sub
WHERE
  id = $enrollment_id
RETURNING
  *;

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

-- BLOCK delete_loser_enrollments
DELETE FROM enrollments
WHERE
  id = ANY ($loser_enrollment_ids::bigint[])
RETURNING
  *;

-- A savepoint is required because runInTransactionAsync reuses an existing
-- transaction. Rolling back the failed attempt releases its row locks and
-- clears PostgreSQL's failed-transaction state before the one allowed retry.
-- BLOCK create_enrollment_identity_reconciliation_savepoint
SAVEPOINT enrollment_identity_reconciliation_attempt;

-- BLOCK rollback_enrollment_identity_reconciliation_savepoint
ROLLBACK TO SAVEPOINT enrollment_identity_reconciliation_attempt;

-- BLOCK release_enrollment_identity_reconciliation_savepoint
RELEASE SAVEPOINT enrollment_identity_reconciliation_attempt;
