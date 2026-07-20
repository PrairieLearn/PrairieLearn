-- BLOCK update_enrollments_lti_managed
UPDATE enrollments
SET
  lti_managed = NULL
WHERE
  lti_managed = FALSE
  AND id >= $start
  AND id <= $end;
