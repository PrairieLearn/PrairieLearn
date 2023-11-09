-- BLOCK select_issues_for_last_variant
WITH
  last_variant AS (
    SELECT
      *
    FROM
      variants
    ORDER BY
      date DESC
    LIMIT
      1
  )
SELECT
  *
FROM
  issues,
  last_variant
WHERE
  variant_id = last_variant.id;
