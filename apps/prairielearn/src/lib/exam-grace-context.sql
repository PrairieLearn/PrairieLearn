-- BLOCK select_optional_context
SELECT
  to_jsonb(ai.*) AS assessment_instance,
  to_jsonb(a.*) AS assessment
FROM
  assessment_instances ai
  JOIN assessments a ON a.id = ai.assessment_id
  JOIN course_instances ci ON ci.id = a.course_instance_id
  JOIN courses c ON c.id = ci.course_id
WHERE
  ai.id = $assessment_instance_id
  AND a.id = $assessment_id
  AND ci.id = $course_instance_id
  AND c.id = $course_id
  AND a.deleted_at IS NULL
  AND ci.deleted_at IS NULL
  AND c.deleted_at IS NULL
  AND (
    (
      NOT a.team_work
      AND ai.user_id = $user_id
    )
    OR (
      a.team_work
      AND EXISTS (
        SELECT
          1
        FROM
          team_users tu
          JOIN teams t ON t.id = tu.team_id
        WHERE
          tu.team_id = ai.team_id
          AND tu.user_id = $user_id
          AND t.deleted_at IS NULL
      )
    )
  );

-- BLOCK select_optional_reservation
SELECT
  r.id,
  r.access_start,
  r.access_end
FROM
  pt_reservations r
  JOIN pt_enrollments pe ON pe.id = r.enrollment_id
  JOIN pt_exams x ON x.id = r.exam_id
  JOIN assessments a ON a.id = $assessment_id
WHERE
  pe.user_id = $user_id
  AND r.access_start IS NOT NULL
  AND r.access_end IS NOT NULL
  AND (
    $reservation_id::bigint IS NULL
    OR r.id = $reservation_id
  )
  AND (
    $exam_access_end::timestamptz IS NULL
    OR r.access_end = $exam_access_end
  )
  AND (
    $max_access_end::timestamptz IS NULL
    OR r.access_end <= $max_access_end
  )
  AND (
    $reference_date::timestamptz IS NULL
    OR $reference_date BETWEEN r.access_start AND r.access_end
  )
  AND (
    (
      NOT a.modern_access_control
      AND EXISTS (
        SELECT
          1
        FROM
          assessment_access_rules aar
        WHERE
          aar.assessment_id = a.id
          AND aar.exam_uuid = x.uuid
          AND aar.mode = 'Exam'
          AND aar.active
      )
    )
    OR (
      a.modern_access_control
      AND EXISTS (
        SELECT
          1
        FROM
          assessment_access_control_rules aacr
          JOIN assessment_access_control_prairietest_exams acpe ON acpe.assessment_access_control_rule_id = aacr.id
        WHERE
          aacr.assessment_id = a.id
          AND acpe.uuid = x.uuid
          AND NOT acpe.read_only
      )
    )
  )
ORDER BY
  r.id
LIMIT
  1;
