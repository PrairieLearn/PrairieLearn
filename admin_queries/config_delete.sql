DELETE FROM config
WHERE
  key = $key
RETURNING
  key,
  value;
