-- BLOCK backfill_share_publicly
UPDATE questions AS q
SET
  share_publicly = q.shared_publicly
FROM
  questions
WHERE
  q.id >= $start
  AND q.id <= $end;
