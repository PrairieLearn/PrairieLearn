-- BLOCK backfill_share_publicly
UPDATE questions AS q
SET
  share_publicly = q.shared_publicly
FROM
  questions AS q
WHERE
  v.id >= $start
  AND v.id <= $end;
