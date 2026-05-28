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
        jsonb_build_object(
          'uuid',
          pte.uuid,
          'read_only',
          pte.read_only,
          'after_complete_questions_hidden',
          pte.after_complete_questions_hidden,
          'after_complete_score_hidden',
          pte.after_complete_score_hidden
        )
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

-- BLOCK count_enrollment_access_control_rules
SELECT
  count(*)::integer
FROM
  assessment_access_control_rules
WHERE
  assessment_id = $assessment_id
  AND target_type = 'enrollment';

-- BLOCK select_prairietest_exam_metadata_by_uuids
SELECT DISTINCT
  u::text AS uuid,
  pt_x.id::text AS pt_exam_id,
  pt_x.name AS pt_exam_name,
  pt_c.id::text AS pt_course_id,
  pt_c.name AS pt_course_name
FROM
  unnest($exam_uuids::uuid[]) AS u
  LEFT JOIN pt_exams AS pt_x ON (pt_x.uuid = u)
  LEFT JOIN pt_courses AS pt_c ON (pt_c.id = pt_x.course_id);

-- BLOCK delete_enrollment_rules_by_ids
DELETE FROM assessment_access_control_rules
WHERE
  id = ANY ($ids::bigint[])
  AND target_type = 'enrollment'
  AND assessment_id = $assessment_id;
