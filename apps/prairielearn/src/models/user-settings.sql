-- BLOCK select_user_settings
SELECT
  *
FROM
  user_settings
WHERE
  user_id = $user_id;

-- BLOCK upsert_user_settings
INSERT INTO
  user_settings (user_id, enable_single_key_shortcuts)
VALUES
  ($user_id, $enable_single_key_shortcuts)
ON CONFLICT (user_id) DO UPDATE
SET
  enable_single_key_shortcuts = EXCLUDED.enable_single_key_shortcuts
RETURNING
  *;
