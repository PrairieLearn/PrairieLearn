-- BLOCK read_assessment_instance_points
SELECT
  ai.points,
  ai.score_perc
FROM
  assessment_instances AS ai
WHERE
  ai.assessment_id = $assessment_id;
