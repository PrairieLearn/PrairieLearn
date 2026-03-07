-- BLOCK select_access_control_with_details
SELECT
  to_jsonb(aac.*) AS access_control,
  (
    SELECT
      jsonb_agg(
        jsonb_build_object('id', sl.id::text, 'name', sl.name)
        ORDER BY
          sl.name
      )
    FROM
      assessment_access_control_student_labels AS aacsl
      JOIN student_labels AS sl ON (sl.id = aacsl.student_label_id)
    WHERE
      aacsl.assessment_access_control_id = aac.id
  ) AS groups,
  (
    SELECT
      jsonb_agg(
        jsonb_build_object(
          'enrollmentId',
          e.id::text,
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
      JOIN users AS u ON (u.user_id = e.user_id)
    WHERE
      aace.assessment_access_control_id = aac.id
  ) AS individual_targets,
  (
    SELECT
      jsonb_agg(
        jsonb_build_object('date', d.date::text, 'credit', d.credit)
        ORDER BY
          d.sort_order
      )
    FROM
      assessment_access_control_early_deadline AS d
    WHERE
      d.access_control_id = aac.id
  ) AS early_deadlines,
  (
    SELECT
      jsonb_agg(
        jsonb_build_object('date', d.date::text, 'credit', d.credit)
        ORDER BY
          d.sort_order
      )
    FROM
      assessment_access_control_late_deadline AS d
    WHERE
      d.access_control_id = aac.id
  ) AS late_deadlines,
  (
    SELECT
      jsonb_agg(
        jsonb_build_object('examUuid', pte.uuid, 'readOnly', pte.read_only)
      )
    FROM
      assessment_access_control_prairietest_exam AS pte
    WHERE
      pte.access_control_id = aac.id
  ) AS prairietest_exams
FROM
  assessment_access_control AS aac
WHERE
  aac.id = $rule_id
  AND aac.assessment_id = $assessment_id;
