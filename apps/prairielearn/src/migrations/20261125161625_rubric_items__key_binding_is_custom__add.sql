-- Whether `key_binding` was chosen by the instructor. Other items get digits
-- assigned in item order on every save, skipping digits taken by custom keys.
ALTER TABLE rubric_items
ADD COLUMN key_binding_is_custom BOOLEAN NOT NULL DEFAULT FALSE;
