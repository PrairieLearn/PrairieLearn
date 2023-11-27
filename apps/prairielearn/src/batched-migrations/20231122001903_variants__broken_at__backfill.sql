-- BLOCK update_variants_broken_at
UPDATE variants AS v
SET
  broken_at = v.date
WHERE
  v.broken = true
  AND v.broken_at IS NULL
  AND v.id >= $start
  and v.id <= $end;
