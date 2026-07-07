CREATE TABLE IF NOT EXISTS user_settings (
  id bigserial PRIMARY KEY,
  enable_keyboard_shortcut BOOLEAN NOT NULL DEFAULT TRUE,
  user_id BIGINT NOT NULL REFERENCES users ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS user_settings_user_id_idx ON user_settings (user_id);
