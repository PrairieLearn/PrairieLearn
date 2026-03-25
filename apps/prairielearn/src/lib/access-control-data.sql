-- BLOCK select_access_control_rules
SELECT
  to_jsonb(aacr.*) AS access_control_rule,
  COALESCE(
    array_agg(DISTINCT ace.enrollment_id) FILTER (
      WHERE
        ace.enrollment_id IS NOT NULL
    ),
    '{}'
  ) AS enrollment_ids,
  COALESCE(
    array_agg(DISTINCT acsl.student_label_id) FILTER (
      WHERE
        acsl.student_label_id IS NOT NULL
    ),
    '{}'
  ) AS student_label_ids,
  (
    SELECT
      jsonb_agg(
        jsonb_build_object('uuid', acpe.uuid, 'read_only', acpe.read_only)
        ORDER BY
          acpe.uuid
      )
    FROM
      assessment_access_control_prairietest_exams acpe
    WHERE
      acpe.assessment_access_control_rule_id = aacr.id
  ) AS prairietest_exams,
  (
    SELECT
      jsonb_agg(
        jsonb_build_object('date', ed.date, 'credit', ed.credit)
        ORDER BY
          ed.date
      )
    FROM
      assessment_access_control_early_deadlines ed
    WHERE
      ed.assessment_access_control_rule_id = aacr.id
  ) AS early_deadlines,
  (
    SELECT
      jsonb_agg(
        jsonb_build_object('date', ld.date, 'credit', ld.credit)
        ORDER BY
          ld.date
      )
    FROM
      assessment_access_control_late_deadlines ld
    WHERE
      ld.assessment_access_control_rule_id = aacr.id
  ) AS late_deadlines
FROM
  assessment_access_control_rules aacr
  JOIN assessments a ON a.id = aacr.assessment_id
  LEFT JOIN assessment_access_control_enrollments ace ON ace.assessment_access_control_rule_id = aacr.id
  LEFT JOIN assessment_access_control_student_labels acsl ON acsl.assessment_access_control_rule_id = aacr.id
WHERE
  (
    $assessment_id::bigint IS NOT NULL
    AND aacr.assessment_id = $assessment_id
  )
  OR (
    $course_instance_id::bigint IS NOT NULL
    AND a.course_instance_id = $course_instance_id
    AND a.deleted_at IS NULL
  )
GROUP BY
  aacr.id
ORDER BY
  aacr.assessment_id,
  CASE aacr.target_type
    WHEN 'none' THEN 0
    WHEN 'enrollment' THEN 1
    WHEN 'student_label' THEN 2
  END,
  aacr.number;

-- BLOCK select_user_access_context
WITH
  enrollment AS (
    SELECT
      e.id AS enrollment_id,
      COALESCE(
        array_agg(sle.student_label_id) FILTER (
          WHERE
            sle.student_label_id IS NOT NULL
        ),
        '{}'
      ) AS student_label_ids
    FROM
      enrollments e
      LEFT JOIN student_label_enrollments sle ON sle.enrollment_id = e.id
    WHERE
      e.user_id = $user_id
      AND e.course_instance_id = $course_instance_id
    GROUP BY
      e.id
  ),
  reservations AS (
    SELECT
      x.uuid AS exam_uuid,
      r.access_end
    FROM
      pt_reservations r
      JOIN pt_enrollments pe ON pe.id = r.enrollment_id
      JOIN pt_exams x ON x.id = r.exam_id
    WHERE
      pe.user_id = $user_id
      AND $date::timestamptz BETWEEN r.access_start AND r.access_end
  )
SELECT
  (
    SELECT
      to_jsonb(e.*)
    FROM
      enrollment e
  ) AS enrollment,
  COALESCE(
    (
      SELECT
        jsonb_agg(to_jsonb(r.*))
      FROM
        reservations r
    ),
    '[]'::jsonb
  ) AS reservations;
