-- Candidate selection is intentionally read-only. In particular, it never locks
-- users, lti13_users, or lti13_course_instances. A caller that supplies an LTI
-- identity only gets LTI provenance when that exact link belongs to the requested
-- PrairieLearn course instance. Passing enrollment_ids restricts revalidation to
-- enrollment parents already locked by the caller.
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
      AND (
        $enrollment_ids::bigint[] IS NULL
        OR e.id = ANY ($enrollment_ids::bigint[])
      )
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
