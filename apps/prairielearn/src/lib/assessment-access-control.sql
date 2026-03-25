-- BLOCK select_all_json_rules
SELECT
  aacr.id::text AS id,
  aacr.number,
  aacr.target_type,
  aacr.list_before_release,
  aacr.date_control_release_date_overridden,
  aacr.date_control_release_date,
  aacr.date_control_due_date_overridden,
  aacr.date_control_due_date,
  aacr.date_control_early_deadlines_overridden,
  aacr.date_control_late_deadlines_overridden,
  aacr.date_control_after_last_deadline_allow_submissions,
  aacr.date_control_after_last_deadline_credit_overridden,
  aacr.date_control_after_last_deadline_credit,
  aacr.date_control_duration_minutes_overridden,
  aacr.date_control_duration_minutes,
  aacr.date_control_password_overridden,
  aacr.date_control_password,
  aacr.after_complete_hide_questions,
  aacr.after_complete_show_questions_again_date_overridden,
  aacr.after_complete_show_questions_again_date,
  aacr.after_complete_hide_questions_again_date_overridden,
  aacr.after_complete_hide_questions_again_date,
  aacr.after_complete_hide_score,
  aacr.after_complete_show_score_again_date_overridden,
  aacr.after_complete_show_score_again_date,
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
      aacsl.assessment_access_control_rule_id = aacr.id
  ) AS labels,
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
  AND aacr.target_type IN ('none', 'student_label')
ORDER BY
  aacr.number;

-- BLOCK select_all_enrollment_rules
SELECT
  aacr.id::text AS id,
  aacr.number,
  aacr.target_type,
  aacr.list_before_release,
  aacr.date_control_release_date_overridden,
  aacr.date_control_release_date,
  aacr.date_control_due_date_overridden,
  aacr.date_control_due_date,
  aacr.date_control_early_deadlines_overridden,
  aacr.date_control_late_deadlines_overridden,
  aacr.date_control_after_last_deadline_allow_submissions,
  aacr.date_control_after_last_deadline_credit_overridden,
  aacr.date_control_after_last_deadline_credit,
  aacr.date_control_duration_minutes_overridden,
  aacr.date_control_duration_minutes,
  aacr.date_control_password_overridden,
  aacr.date_control_password,
  aacr.after_complete_hide_questions,
  aacr.after_complete_show_questions_again_date_overridden,
  aacr.after_complete_show_questions_again_date,
  aacr.after_complete_hide_questions_again_date_overridden,
  aacr.after_complete_hide_questions_again_date,
  aacr.after_complete_hide_score,
  aacr.after_complete_show_score_again_date_overridden,
  aacr.after_complete_show_score_again_date,
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
  ) AS late_deadlines
FROM
  assessment_access_control_rules AS aacr
WHERE
  aacr.assessment_id = $assessment_id
  AND aacr.target_type = 'enrollment'
ORDER BY
  aacr.number;
