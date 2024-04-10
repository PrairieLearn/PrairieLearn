-- BLOCK select_job
SELECT
  CASE
    WHEN ai.id IS NULL THEN NULL
    ELSE to_jsonb(
      authz_assessment_instance (
        ai.id,
        $authz_data,
        $req_date,
        ci.display_timezone,
        a.group_work
      )
    )
  END AS aai,
  to_jsonb(gj.*) AS grading_job,
  format_date_full_compact_ms (
    gj.grading_requested_at,
    coalesce(ci.display_timezone, c.display_timezone)
  ) AS formatted_grading_requested_at,
  format_date_full_compact_ms (
    gj.grading_submitted_at,
    coalesce(ci.display_timezone, c.display_timezone)
  ) AS formatted_grading_submitted_at,
  format_date_full_compact_ms (
    gj.grading_received_at,
    coalesce(ci.display_timezone, c.display_timezone)
  ) AS formatted_grading_received_at,
  format_date_full_compact_ms (
    gj.grading_started_at,
    coalesce(ci.display_timezone, c.display_timezone)
  ) AS formatted_grading_started_at,
  format_date_full_compact_ms (
    gj.grading_finished_at,
    coalesce(ci.display_timezone, c.display_timezone)
  ) AS formatted_grading_finished_at,
  format_date_full_compact_ms (
    gj.graded_at,
    coalesce(ci.display_timezone, c.display_timezone)
  ) AS formatted_graded_at,
  q.directory AS question_qid,
  u.uid AS user_uid
FROM
  grading_jobs AS gj
  JOIN submissions AS s ON (s.id = gj.submission_id)
  JOIN variants AS v ON (v.id = s.variant_id)
  JOIN pl_courses AS c ON (c.id = v.course_id)
  JOIN questions AS q ON (q.id = v.question_id)
  LEFT JOIN instance_questions AS iq ON (iq.id = v.instance_question_id)
  LEFT JOIN assessment_questions AS aq ON (aq.id = iq.assessment_question_id)
  LEFT JOIN assessment_instances AS ai ON (ai.id = iq.assessment_instance_id)
  LEFT JOIN assessments AS a ON (a.id = ai.assessment_id)
  LEFT JOIN course_instances AS ci ON (ci.id = v.course_instance_id)
  LEFT JOIN users AS u ON (u.user_id = s.auth_user_id)
WHERE
  gj.id = $job_id
  AND gj.grading_method = 'External'
  AND c.id = $course_id
  AND ci.id IS NOT DISTINCT FROM $course_instance_id;
