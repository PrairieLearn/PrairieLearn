-- BLOCK backfill_share_publicly
UPDATE questions
SET
  share_publicly = shared_publicly
WHERE
  shared_publicly IS TRUE
  AND id >= $start
  AND id <= $end;
