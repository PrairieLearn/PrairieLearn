-- BLOCK select_bounds
SELECT
  MAX(id)
FROM
  variants;

-- BLOCK update_variants_modified_at
UPDATE variants
SET
  modified_at = COALESCE(
    (
      SELECT
        MAX(COALESCE(s.graded_at, s.date))
      FROM
        submissions AS s
      WHERE
        variant_id = variants.id
    ),
    -- If the variant doesn't have any submissions, we'll use its creation date.
    variants.date
  )
WHERE
  modified_at IS NULL
  AND id >= $start
  AND id <= $end;
