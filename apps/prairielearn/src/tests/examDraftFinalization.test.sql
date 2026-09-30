-- BLOCK set_date_limit_minutes_ago
UPDATE assessment_instances
SET
  date_limit = CURRENT_TIMESTAMP - make_interval(mins => $minutes_ago)
WHERE
  id = $assessment_instance_id;
