UPDATE assessment_access_control_rules
SET
  uuid = gen_random_uuid()
WHERE
  target_type <> 'none'
  AND uuid IS NULL;
