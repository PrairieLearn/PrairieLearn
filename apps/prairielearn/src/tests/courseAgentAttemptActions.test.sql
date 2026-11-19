-- BLOCK select_assessment_instance
SELECT
  ai.open,
  ai.date_limit,
  ai.score_perc,
  ai.points
FROM
  assessment_instances AS ai
WHERE
  ai.id = $assessment_instance_id;
