ALTER TABLE rubric_items
ADD COLUMN parent_id bigint;

ALTER TABLE rubric_items
ADD FOREIGN KEY (parent_id) REFERENCES rubric_items (id) ON UPDATE CASCADE ON DELETE CASCADE;
