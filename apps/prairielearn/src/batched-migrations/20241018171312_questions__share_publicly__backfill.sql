-- BLOCK backfill_share_publicly
UPDATE questions
SET
  share_publicly = shared_publicly
WHERE
  id >= $start
  AND id <= $end;
