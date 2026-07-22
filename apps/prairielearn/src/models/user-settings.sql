-- BLOCK select_user_settings
SELECT
  *
FROM
  user_settings
WHERE
  user_id = $user_id;

-- BLOCK upsert_user_settings
INSERT INTO
  user_settings (user_id, enable_keyboard_shortcut)
VALUES
  ($user_id, $enable_keyboard_shortcut)
ON CONFLICT (user_id) DO UPDATE
SET
  enable_keyboard_shortcut = EXCLUDED.enable_keyboard_shortcut
RETURNING
  *;
