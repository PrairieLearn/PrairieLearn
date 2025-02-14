-- BLOCK delete_old_usages
DELETE FROM course_instance_usages
WHERE
  date < $CUTOFF_DATE;

-- BLOCK select_bounds
SELECT
  min(id),
  max(id)
FROM
  submissions
WHERE
  date < $CUTOFF_DATE;

-- BLOCK select_user_id_for_submission_id
SELECT
  -- Use the variant authn_user_id to ensure that it is non-NULL. This might not
  -- be the submitting effective user for group work, but we don't care about
  -- getting this correct for historical data.
  v.authn_user_id
FROM
  submissions AS s
  JOIN variants AS v ON (v.id = s.variant_id)
WHERE
  s.id = $submission_id;
