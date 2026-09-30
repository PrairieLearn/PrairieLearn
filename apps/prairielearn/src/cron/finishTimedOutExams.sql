-- BLOCK select_expired_exams
SELECT
  ai.id,
  ai.assessment_id
FROM
  assessment_instances AS ai
  JOIN assessments AS a ON (a.id = ai.assessment_id)
WHERE
  ai.open
  AND a.type = 'Exam'
  AND ai.date_limit <= CURRENT_TIMESTAMP - make_interval(secs => $grace_period_sec);
