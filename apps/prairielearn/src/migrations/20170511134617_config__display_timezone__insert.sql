INSERT INTO
  config (key, value)
VALUES
  ('display_timezone', 'America/Chicago')
ON CONFLICT (key) DO NOTHING;
