ALTER TABLE shared_state_objects
ADD COLUMN IF NOT EXISTS current_revision_id BIGINT REFERENCES shared_state_object_revisions (id) ON UPDATE CASCADE ON DELETE SET NULL;
