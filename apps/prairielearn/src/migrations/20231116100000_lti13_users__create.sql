CREATE TABLE IF NOT EXISTS lti13_users (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users ON DELETE CASCADE ON UPDATE CASCADE,
  lti13_instance_id BIGINT NOT NULL REFERENCES lti13_instances ON DELETE CASCADE ON UPDATE CASCADE,
  sub text NOT NULL,
  UNIQUE (user_id, lti13_instance_id)
);

CREATE INDEX IF NOT EXISTS lti13_users_user_id_lti13_instance_id_idx ON lti13_users (user_id, lti13_instance_id);
