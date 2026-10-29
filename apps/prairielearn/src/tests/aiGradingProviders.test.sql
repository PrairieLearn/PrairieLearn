-- BLOCK select_test_instance_question_id
SELECT
  id
FROM
  instance_questions
WHERE
  assessment_instance_id = $assessment_instance_id;

-- BLOCK select_test_grading_result
SELECT
  to_jsonb(agj.*) AS ai_grading_job,
  to_jsonb(gj.*) AS grading_job,
  to_jsonb(iq.*) AS instance_question
FROM
  ai_grading_jobs AS agj
  JOIN grading_jobs AS gj ON gj.id = agj.grading_job_id
  JOIN submissions AS s ON s.id = gj.submission_id
  JOIN variants AS v ON v.id = s.variant_id
  JOIN instance_questions AS iq ON iq.id = v.instance_question_id
WHERE
  agj.job_sequence_id = $job_sequence_id;
