-- Rubric items can be organized into nested groups (#6861). Groups and items
-- live in the same table: `number` stays rubric-wide and is assigned in
-- depth-first (pre-order) order, so `ORDER BY number` yields the tree ready
-- for a single stack-based traversal. `parent_id` records the parent group
-- for integrity checks.
ALTER TABLE rubric_items
ADD COLUMN parent_id BIGINT;

ALTER TABLE rubric_items
ADD COLUMN is_group BOOLEAN NOT NULL DEFAULT FALSE;

-- Selection rules, only meaningful on groups. NULL means "no limit".
-- "Select one" is max_selections = 1; "required" is min_selections = 1.
ALTER TABLE rubric_items
ADD COLUMN min_selections INTEGER;

ALTER TABLE rubric_items
ADD COLUMN max_selections INTEGER;

ALTER TABLE rubric_items
ADD CONSTRAINT rubric_items_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES rubric_items (id) ON UPDATE CASCADE ON DELETE CASCADE NOT VALID;

-- Groups carry no points or key binding; selection rules are only allowed on
-- groups and must describe a satisfiable range.
ALTER TABLE rubric_items
ADD CONSTRAINT rubric_items_group_fields_check CHECK (
  (
    (
      is_group
      AND points = 0
      AND key_binding IS NULL
    )
    OR (
      NOT is_group
      AND min_selections IS NULL
      AND max_selections IS NULL
    )
  )
  AND (
    min_selections IS NULL
    OR min_selections >= 0
  )
  AND (
    max_selections IS NULL
    OR max_selections >= 1
  )
  AND (
    min_selections IS NULL
    OR max_selections IS NULL
    OR min_selections <= max_selections
  )
  AND (
    parent_id IS NULL
    OR parent_id <> id
  )
) NOT VALID;

-- Needed so that ON DELETE CASCADE from a parent doesn't scan the table.
-- Every existing row has a NULL parent_id, so this builds instantly.
CREATE INDEX rubric_items_parent_id_idx ON rubric_items (parent_id)
WHERE
  parent_id IS NOT NULL;
