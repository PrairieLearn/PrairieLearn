-- This table is used to track which instance groups an enrollment (enrolled user) is a member of.
CREATE TABLE enrollment_instance_groups (
  id BIGSERIAL PRIMARY KEY,
  enrollment_id BIGINT NOT NULL REFERENCES enrollments(id) ON DELETE CASCADE,
  instance_group_id BIGINT NOT NULL REFERENCES instance_groups(id) ON DELETE CASCADE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (enrollment_id, instance_group_id)
);

-- This index is used to quickly find all enrollments that are members of a given instance group.
CREATE INDEX enrollment_instance_groups_instance_group_id_key ON enrollment_instance_groups (instance_group_id);
