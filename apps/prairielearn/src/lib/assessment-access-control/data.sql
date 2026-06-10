-- BLOCK select_access_control_rules
SELECT
  a.id AS assessment_id,
  COALESCE(
    jsonb_agg(
      to_jsonb(rules.*) - 'target_type' - 'number'
      ORDER BY
        CASE rules.target_type
          WHEN 'none' THEN 0
          WHEN 'student_label' THEN 1
          WHEN 'enrollment' THEN 2
        END,
        rules.number
    ) FILTER (
      WHERE
        rules.access_control_rule IS NOT NULL
    ),
    '[]'::jsonb
  ) AS access_control_rules
FROM
  assessments a
  LEFT JOIN LATERAL (
    SELECT
      to_jsonb(aacr.*) AS access_control_rule,
      aacr.target_type,
      aacr.number,
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
            jsonb_build_object(
              'uuid',
              acpe.uuid,
              'read_only',
              acpe.read_only,
              'after_complete_questions_hidden',
              acpe.after_complete_questions_hidden,
              'after_complete_score_hidden',
              acpe.after_complete_score_hidden
            )
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
      LEFT JOIN assessment_access_control_enrollments ace ON ace.assessment_access_control_rule_id = aacr.id
      LEFT JOIN assessment_access_control_student_labels acsl ON acsl.assessment_access_control_rule_id = aacr.id
    WHERE
      aacr.assessment_id = a.id
    GROUP BY
      aacr.id
  ) AS rules ON TRUE
WHERE
  (
    $assessment_id::bigint IS NOT NULL
    AND a.id = $assessment_id
  )
  OR (
    $course_instance_id::bigint IS NOT NULL
    AND a.course_instance_id = $course_instance_id
    AND a.modern_access_control
    AND a.deleted_at IS NULL
  )
GROUP BY
  a.id
ORDER BY
  a.id;

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
