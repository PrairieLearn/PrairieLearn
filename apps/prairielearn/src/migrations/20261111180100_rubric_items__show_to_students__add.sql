CREATE TYPE enum_rubric_item_show_to_students AS ENUM('always', 'when_selected', 'never');

ALTER TABLE rubric_items
ADD COLUMN show_to_students enum_rubric_item_show_to_students NOT NULL DEFAULT 'always';
