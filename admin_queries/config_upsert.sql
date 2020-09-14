INSERT INTO config (key, value)
VALUES ($key, $value)
ON CONFLICT (key) DO UPDATE
SET value = EXCLUDED.value
RETURNING key, value;
