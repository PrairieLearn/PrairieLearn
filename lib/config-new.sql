-- set_value
INSERT INTO
  config (key, value)
VALUES
  ($key, $value)
ON CONFLICT (key) DO
UPDATE
SET
  value = EXCLUDED.value;

-- remove_key
DELETE FROM config
WHERE
  key = $key;
