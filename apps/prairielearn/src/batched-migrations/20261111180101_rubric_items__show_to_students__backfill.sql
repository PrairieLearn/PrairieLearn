-- BLOCK select_bounds
SELECT
  MAX(id)
FROM
  rubric_items;

-- BLOCK update_rubric_items
UPDATE rubric_items
SET
  show_to_students = CASE
    WHEN always_show_to_students THEN 'always'::enum_rubric_item_show_to_students
    ELSE 'when_selected'::enum_rubric_item_show_to_students
  END
WHERE
  id >= $start
  AND id <= $end;
