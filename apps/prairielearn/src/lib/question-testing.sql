-- BLOCK select_issue_count_for_variant
SELECT
  COUNT(*)::int
FROM
  issues AS i
WHERE
  i.variant_id = $variant_id;
