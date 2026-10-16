-- BLOCK select_assessment_instances
SELECT
  *
FROM
  assessment_instances;

-- BLOCK set_pending_score
UPDATE assessment_instances
SET
  score_perc_pending = 75,
  grading_pending = TRUE;
