-- BLOCK insert_legacy_rubric_items
WITH
  rubric AS (
    INSERT INTO
      rubrics (
        max_extra_points,
        min_points,
        replace_auto_points,
        starting_points
      )
    VALUES
      (0, 0, false, 0)
    RETURNING
      id
  )
INSERT INTO
  rubric_items (
    rubric_id,
    number,
    points,
    description,
    always_show_to_students,
    deleted_at
  )
SELECT
  rubric.id,
  item.number,
  1,
  'Legacy item',
  item.always_show_to_students,
  CASE
    WHEN item.number = 3 THEN CURRENT_TIMESTAMP
    ELSE NULL
  END
FROM
  rubric
  CROSS JOIN (
    VALUES
      (1, true),
      (2, false),
      (3, false)
  ) AS item (number, always_show_to_students)
ORDER BY
  item.number;

-- BLOCK select_rubric_items
SELECT
  *
FROM
  rubric_items
ORDER BY
  id;
