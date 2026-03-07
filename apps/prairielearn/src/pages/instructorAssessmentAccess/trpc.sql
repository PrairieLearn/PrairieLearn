-- BLOCK select_enrolled_students
SELECT
  e.id::text AS id,
  u.uid,
  u.name
FROM
  enrollments AS e
  JOIN users AS u ON (u.id = e.user_id)
WHERE
  e.course_instance_id = $course_instance_id
  AND e.status = 'joined'
ORDER BY
  u.uid;

-- BLOCK select_all_json_rules
SELECT
  aac.id::text AS id,
  aac.number,
  aac.target_type,
  aac.enabled,
  aac.block_access,
  aac.list_before_release,
  aac.date_control_overridden,
  aac.date_control_release_date_overridden,
  aac.date_control_release_date,
  aac.date_control_due_date_overridden,
  aac.date_control_due_date,
  aac.date_control_early_deadlines_overridden,
  aac.date_control_late_deadlines_overridden,
  aac.date_control_after_last_deadline_allow_submissions,
  aac.date_control_after_last_deadline_credit_overridden,
  aac.date_control_after_last_deadline_credit,
  aac.date_control_duration_minutes_overridden,
  aac.date_control_duration_minutes,
  aac.date_control_password_overridden,
  aac.date_control_password,
  aac.integrations_prairietest_overridden,
  aac.after_complete_hide_questions,
  aac.after_complete_show_questions_again_date_overridden,
  aac.after_complete_show_questions_again_date,
  aac.after_complete_hide_questions_again_date_overridden,
  aac.after_complete_hide_questions_again_date,
  aac.after_complete_hide_score,
  aac.after_complete_show_score_again_date_overridden,
  aac.after_complete_show_score_again_date,
  (
    SELECT
      jsonb_agg(
        sl.name
        ORDER BY
          sl.name
      )
    FROM
      assessment_access_control_student_labels AS aacsl
      JOIN student_labels AS sl ON (sl.id = aacsl.student_label_id)
    WHERE
      aacsl.assessment_access_control_id = aac.id
  ) AS labels,
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
      d.assessment_access_control_id = aac.id
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
      d.assessment_access_control_id = aac.id
  ) AS late_deadlines,
  (
    SELECT
      jsonb_agg(
        jsonb_build_object('examUuid', pte.uuid, 'readOnly', pte.read_only)
      )
    FROM
      assessment_access_control_prairietest_exam AS pte
    WHERE
      pte.assessment_access_control_id = aac.id
  ) AS prairietest_exams
FROM
  assessment_access_control AS aac
WHERE
  aac.assessment_id = $assessment_id
  AND aac.target_type IN ('none', 'student_label')
ORDER BY
  aac.number;
