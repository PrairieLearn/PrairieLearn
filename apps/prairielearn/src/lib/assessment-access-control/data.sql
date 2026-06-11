-- BLOCK select_access_control_rules
SELECT
  a.id AS assessment_id,
  COALESCE(rules.access_control_rules, '[]'::jsonb) AS access_control_rules
FROM
  assessments a
  LEFT JOIN LATERAL (
    SELECT
      jsonb_agg(
        jsonb_build_object(
          'access_control_rule',
          to_jsonb(aacr.*),
          'enrollment_ids',
          COALESCE(
            (
              SELECT
                array_agg(
                  ace.enrollment_id
                  ORDER BY
                    ace.enrollment_id
                )
              FROM
                assessment_access_control_enrollments ace
              WHERE
                ace.assessment_access_control_rule_id = aacr.id
            ),
            ARRAY[]::bigint[]
          ),
          'student_label_ids',
          COALESCE(
            (
              SELECT
                array_agg(
                  acsl.student_label_id
                  ORDER BY
                    acsl.student_label_id
                )
              FROM
                assessment_access_control_student_labels acsl
              WHERE
                acsl.assessment_access_control_rule_id = aacr.id
            ),
            ARRAY[]::bigint[]
          ),
          'prairietest_exams',
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
          ),
          'early_deadlines',
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
          ),
          'late_deadlines',
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
          )
        )
        ORDER BY
          CASE aacr.target_type
            WHEN 'none' THEN 0
            WHEN 'student_label' THEN 1
            WHEN 'enrollment' THEN 2
          END,
          aacr.number
      ) AS access_control_rules
    FROM
      assessment_access_control_rules aacr
    WHERE
      aacr.assessment_id = a.id
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
