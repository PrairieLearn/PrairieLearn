-- BLOCK select_access_control_rules
SELECT
  to_jsonb(aacr.*) AS access_control_rule,
  (
    SELECT
      jsonb_agg(
        jsonb_build_object(
          'id',
          sl.id::text,
          'name',
          sl.name,
          'color',
          sl.color
        )
        ORDER BY
          sl.name
      )
    FROM
      assessment_access_control_student_labels AS aacsl
      JOIN student_labels AS sl ON (sl.id = aacsl.student_label_id)
    WHERE
      aacsl.assessment_access_control_rule_id = aacr.id
  ) AS labels,
  (
    SELECT
      jsonb_agg(
        jsonb_build_object(
          'enrollment_id',
          aace.enrollment_id::text,
          'uid',
          u.uid,
          'name',
          u.name
        )
        ORDER BY
          u.uid
      )
    FROM
      assessment_access_control_enrollments AS aace
      JOIN enrollments AS e ON (e.id = aace.enrollment_id)
      JOIN users AS u ON (u.id = e.user_id)
    WHERE
      aace.assessment_access_control_rule_id = aacr.id
  ) AS enrollments,
  (
    SELECT
      jsonb_agg(
        jsonb_build_object('date', d.date::text, 'credit', d.credit)
        ORDER BY
          d.date
      )
    FROM
      assessment_access_control_early_deadlines AS d
    WHERE
      d.assessment_access_control_rule_id = aacr.id
  ) AS early_deadlines,
  (
    SELECT
      jsonb_agg(
        jsonb_build_object('date', d.date::text, 'credit', d.credit)
        ORDER BY
          d.date
      )
    FROM
      assessment_access_control_late_deadlines AS d
    WHERE
      d.assessment_access_control_rule_id = aacr.id
  ) AS late_deadlines,
  (
    SELECT
      jsonb_agg(
        jsonb_build_object('uuid', pte.uuid, 'read_only', pte.read_only)
        ORDER BY
          pte.uuid
      )
    FROM
      assessment_access_control_prairietest_exams AS pte
    WHERE
      pte.assessment_access_control_rule_id = aacr.id
  ) AS prairietest_exams
FROM
  assessment_access_control_rules AS aacr
WHERE
  aacr.assessment_id = $assessment_id
  AND aacr.target_type = ANY (
    $target_types::enum_assessment_access_control_target_type[]
  )
ORDER BY
  CASE aacr.target_type
    WHEN 'none' THEN 0
    WHEN 'student_label' THEN 1
    WHEN 'enrollment' THEN 2
  END,
  aacr.number;

-- BLOCK delete_enrollment_rules_by_ids
DELETE FROM assessment_access_control_rules
WHERE
  id = ANY ($ids::bigint[])
  AND target_type = 'enrollment'
  AND assessment_id = $assessment_id;
