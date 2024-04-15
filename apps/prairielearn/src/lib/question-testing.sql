-- BLOCK select_issue_count_for_variant
SELECT
  COUNT(*)::int
FROM
  issues AS i
WHERE
  i.variant_id = $variant_id;

-- BLOCK select_submission_by_id
SELECT
  *
FROM
  submissions
WHERE
  id = $submission_id;
