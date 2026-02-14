CREATE TABLE assessment_instance_crossed_lockpoints (
  id bigserial PRIMARY KEY,
  assessment_instance_id bigint NOT NULL REFERENCES assessment_instances (id) ON UPDATE CASCADE ON DELETE CASCADE,
  zone_id bigint NOT NULL REFERENCES zones (id) ON UPDATE CASCADE ON DELETE CASCADE,
  crossed_at timestamptz NOT NULL DEFAULT now(),
  authn_user_id bigint REFERENCES users (id) ON UPDATE CASCADE ON DELETE SET NULL,
  UNIQUE (assessment_instance_id, zone_id)
);
