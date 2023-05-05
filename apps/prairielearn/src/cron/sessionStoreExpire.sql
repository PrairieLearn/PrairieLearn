-- BLOCK expire
DELETE FROM pl_sessions
WHERE
  EXTRACT(
    EPOCH
    FROM
      (now() - updated_at)
  ) >= $expirationInSeconds;
