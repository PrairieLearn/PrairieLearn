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

-- BLOCK select_instance_question_for_assessment_instance
SELECT
  iq.*
FROM
  instance_questions AS iq
WHERE
  iq.assessment_instance_id = $assessment_instance_id
  AND iq.assessment_question_id = $assessment_question_id;
