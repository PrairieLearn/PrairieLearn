-- BLOCK select_access_control_rules_for_assessment
SELECT
  aac.id,
  aac.number,
  aac.target_type,
  aac.enabled,
  aac.block_access,
  aac.list_before_release,
  aac.date_control_overridden,
  aac.date_control_release_date,
  aac.date_control_release_date_overridden,
  aac.date_control_due_date,
  aac.date_control_due_date_overridden,
  aac.date_control_duration_minutes,
  aac.date_control_duration_minutes_overridden,
  aac.date_control_password,
  aac.date_control_password_overridden,
  aac.date_control_after_last_deadline_allow_submissions,
  aac.date_control_after_last_deadline_credit,
  aac.date_control_after_last_deadline_credit_overridden,
  aac.date_control_early_deadlines_overridden,
  aac.date_control_late_deadlines_overridden,
  aac.after_complete_hide_questions,
  aac.after_complete_hide_questions_again_date,
  aac.after_complete_hide_questions_again_date_overridden,
  aac.after_complete_hide_score,
  aac.after_complete_show_questions_again_date,
  aac.after_complete_show_questions_again_date_overridden,
  aac.after_complete_show_score_again_date,
  aac.after_complete_show_score_again_date_overridden,
  aac.integrations_prairietest_overridden,
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
  COALESCE(
    array_agg(DISTINCT acpe.uuid) FILTER (
      WHERE
        acpe.uuid IS NOT NULL
    ),
    '{}'
  ) AS prairietest_exam_uuids,
  (
    SELECT
      jsonb_agg(
        jsonb_build_object('date', ed.date, 'credit', ed.credit)
        ORDER BY
          ed.sort_order
      )
    FROM
      assessment_access_control_early_deadline ed
    WHERE
      ed.assessment_access_control_id = aac.id
  ) AS early_deadlines,
  (
    SELECT
      jsonb_agg(
        jsonb_build_object('date', ld.date, 'credit', ld.credit)
        ORDER BY
          ld.sort_order
      )
    FROM
      assessment_access_control_late_deadline ld
    WHERE
      ld.assessment_access_control_id = aac.id
  ) AS late_deadlines
FROM
  assessment_access_control aac
  LEFT JOIN assessment_access_control_enrollments ace ON ace.assessment_access_control_id = aac.id
  LEFT JOIN assessment_access_control_student_labels acsl ON acsl.assessment_access_control_id = aac.id
  LEFT JOIN assessment_access_control_prairietest_exam acpe ON acpe.assessment_access_control_id = aac.id
WHERE
  aac.assessment_id = $assessment_id
GROUP BY
  aac.id
ORDER BY
  CASE aac.target_type
    WHEN 'none' THEN 0
    WHEN 'enrollment' THEN 1
    WHEN 'student_label' THEN 2
  END,
  aac.number;

-- BLOCK select_access_control_rules_for_course_instance
SELECT
  aac.id,
  aac.assessment_id,
  aac.number,
  aac.target_type,
  aac.enabled,
  aac.block_access,
  aac.list_before_release,
  aac.date_control_overridden,
  aac.date_control_release_date,
  aac.date_control_release_date_overridden,
  aac.date_control_due_date,
  aac.date_control_due_date_overridden,
  aac.date_control_duration_minutes,
  aac.date_control_duration_minutes_overridden,
  aac.date_control_password,
  aac.date_control_password_overridden,
  aac.date_control_after_last_deadline_allow_submissions,
  aac.date_control_after_last_deadline_credit,
  aac.date_control_after_last_deadline_credit_overridden,
  aac.date_control_early_deadlines_overridden,
  aac.date_control_late_deadlines_overridden,
  aac.after_complete_hide_questions,
  aac.after_complete_hide_questions_again_date,
  aac.after_complete_hide_questions_again_date_overridden,
  aac.after_complete_hide_score,
  aac.after_complete_show_questions_again_date,
  aac.after_complete_show_questions_again_date_overridden,
  aac.after_complete_show_score_again_date,
  aac.after_complete_show_score_again_date_overridden,
  aac.integrations_prairietest_overridden,
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
  COALESCE(
    array_agg(DISTINCT acpe.uuid) FILTER (
      WHERE
        acpe.uuid IS NOT NULL
    ),
    '{}'
  ) AS prairietest_exam_uuids,
  (
    SELECT
      jsonb_agg(
        jsonb_build_object('date', ed.date, 'credit', ed.credit)
        ORDER BY
          ed.sort_order
      )
    FROM
      assessment_access_control_early_deadline ed
    WHERE
      ed.assessment_access_control_id = aac.id
  ) AS early_deadlines,
  (
    SELECT
      jsonb_agg(
        jsonb_build_object('date', ld.date, 'credit', ld.credit)
        ORDER BY
          ld.sort_order
      )
    FROM
      assessment_access_control_late_deadline ld
    WHERE
      ld.assessment_access_control_id = aac.id
  ) AS late_deadlines
FROM
  assessment_access_control aac
  LEFT JOIN assessment_access_control_enrollments ace ON ace.assessment_access_control_id = aac.id
  LEFT JOIN assessment_access_control_student_labels acsl ON acsl.assessment_access_control_id = aac.id
  LEFT JOIN assessment_access_control_prairietest_exam acpe ON acpe.assessment_access_control_id = aac.id
WHERE
  aac.course_instance_id = $course_instance_id
GROUP BY
  aac.id
ORDER BY
  aac.assessment_id,
  CASE aac.target_type
    WHEN 'none' THEN 0
    WHEN 'enrollment' THEN 1
    WHEN 'student_label' THEN 2
  END,
  aac.number;

-- BLOCK select_student_context
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
  e.id;

-- BLOCK select_prairietest_reservation
SELECT
  x.uuid AS exam_uuid,
  r.access_end
FROM
  pt_reservations r
  JOIN pt_enrollments pe ON pe.id = r.enrollment_id
  JOIN pt_exams x ON x.id = r.exam_id
WHERE
  pe.user_id = $user_id
  AND $date::timestamptz BETWEEN r.access_start AND r.access_end;
