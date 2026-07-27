ALTER TABLE shared_state_objects
ADD COLUMN IF NOT EXISTS current_revision_id BIGINT;

ALTER TABLE shared_state_objects
ADD CONSTRAINT shared_state_objects_current_revision_id_fkey FOREIGN KEY (current_revision_id) REFERENCES shared_state_object_revisions (id) ON UPDATE CASCADE ON DELETE SET NULL NOT VALID;
