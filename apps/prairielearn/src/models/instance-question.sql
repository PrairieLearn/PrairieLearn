-- BLOCK compute_next_allowed_grading_time_ms
SELECT
  GREATEST(
    0,
    floor(
      DATE_PART(
        'epoch',
        (
          MAX(
            gj.date + aq.grade_rate_minutes * make_interval(mins => 1)
          ) - CURRENT_TIMESTAMP
        )
      ) * 1000
    )
  )
FROM
  instance_questions iq
  JOIN assessment_questions aq ON (aq.id = iq.assessment_question_id)
  JOIN variants v ON (v.instance_question_id = iq.id)
  JOIN submissions s ON (s.variant_id = v.id)
  JOIN grading_jobs gj ON (gj.submission_id = s.id)
WHERE
  iq.id = $instance_question_id
  AND aq.grade_rate_minutes IS NOT NULL
  AND gj.gradable
  AND gj.grading_method NOT IN ('Manual', 'AI');

-- BLOCK select_instance_questions_by_ids_for_assessment
SELECT
  to_jsonb(iq.*) AS instance_question,
  to_jsonb(aq.*) AS assessment_question
FROM
  instance_questions AS iq
  JOIN assessment_instances AS ai ON (ai.id = iq.assessment_instance_id)
  JOIN assessment_questions AS aq ON (aq.id = iq.assessment_question_id)
WHERE
  ai.assessment_id = $assessment_id
  AND iq.id = ANY ($instance_question_ids::bigint[])
ORDER BY
  iq.id;
