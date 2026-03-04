CREATE TABLE assessment_instance_crossed_lockpoints (
  id bigserial PRIMARY KEY,
  assessment_instance_id bigint NOT NULL,
  zone_id bigint NOT NULL,
  crossed_at timestamptz NOT NULL DEFAULT now(),
  authn_user_id bigint NOT NULL,
  CONSTRAINT aicl_assessment_instance_id_fkey FOREIGN KEY (assessment_instance_id) REFERENCES assessment_instances (id) ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT assessment_instance_crossed_lockpoints_zone_id_fkey FOREIGN KEY (zone_id) REFERENCES zones (id) ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT assessment_instance_crossed_lockpoints_authn_user_id_fkey FOREIGN KEY (authn_user_id) REFERENCES users (id) ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT aicl_assessment_instance_id_zone_id_key UNIQUE (assessment_instance_id, zone_id)
);

CREATE INDEX assessment_instance_crossed_lockpoints_zone_id_idx ON assessment_instance_crossed_lockpoints (zone_id);
