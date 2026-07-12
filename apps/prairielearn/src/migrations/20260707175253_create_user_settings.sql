DROP TABLE IF EXISTS user_settings;

CREATE TABLE IF NOT EXISTS user_settings (
  enable_keyboard_shortcut BOOLEAN NOT NULL DEFAULT TRUE,
  user_id BIGINT NOT NULL PRIMARY KEY REFERENCES users ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS user_settings_user_id_idx ON user_settings (user_id);
