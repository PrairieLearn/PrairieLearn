-- This query is read-only and never locks users, lti13_users, or
-- lti13_course_instances. Mark an enrollment as an LTI match only when the
-- requested link belongs to this PrairieLearn course instance and the pending
-- `sub` also matches. Passing enrollment_ids restricts the second read to
-- enrollment rows already locked by the caller.
-- BLOCK select_enrollment_identity_candidates
WITH
  user_identity AS MATERIALIZED (
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
  -- Each branch matches an enrollment identity uniqueness index. UNION
  -- deduplicates a row that matches the user through multiple identity keys.
  candidate_ids AS (
    SELECT
      e.id
    FROM
      enrollments AS e
      CROSS JOIN user_identity
    WHERE
      e.user_id = user_identity.user_id
      AND e.course_instance_id = $course_instance_id
    UNION
    SELECT
      e.id
    FROM
      enrollments AS e
      CROSS JOIN user_identity
    WHERE
      e.pending_uid = user_identity.uid
      AND e.course_instance_id = $course_instance_id
    UNION
    SELECT
      e.id
    FROM
      enrollments AS e
      CROSS JOIN user_identity
    WHERE
      user_identity.institution_matches
      AND user_identity.uin IS NOT NULL
      AND e.pending_uin = user_identity.uin
      AND e.course_instance_id = $course_instance_id
    UNION
    SELECT
      e.id
    FROM
      enrollments AS e
      CROSS JOIN user_identity
    WHERE
      user_identity.lti13_course_instance_matches
      AND e.pending_lti13_course_instance_id = $lti13_course_instance_id
      AND e.pending_lti13_sub = $lti13_sub
      AND e.course_instance_id = $course_instance_id
  )
SELECT
  to_jsonb(e.*) AS enrollment,
  coalesce(e.user_id = user_identity.user_id, FALSE) AS matches_bound_user,
  coalesce(e.pending_uid = user_identity.uid, FALSE) AS matches_pending_uid,
  coalesce(
    user_identity.institution_matches
    AND user_identity.uin IS NOT NULL
    AND e.pending_uin = user_identity.uin,
    FALSE
  ) AS matches_institution_uin,
  coalesce(
    user_identity.lti13_course_instance_matches
    AND e.pending_lti13_course_instance_id = $lti13_course_instance_id
    AND e.pending_lti13_sub = $lti13_sub,
    FALSE
  ) AS matches_lti13
FROM
  candidate_ids
  JOIN enrollments AS e USING (id)
  CROSS JOIN user_identity
WHERE
  (
    $enrollment_ids::bigint[] IS NULL
    OR e.id = ANY ($enrollment_ids::bigint[])
  )
ORDER BY
  e.id;
