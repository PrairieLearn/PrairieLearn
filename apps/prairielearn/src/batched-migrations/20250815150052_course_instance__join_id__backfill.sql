-- BLOCK select_bounds
SELECT
  MAX(id)
FROM
  course_instances;

-- BLOCK update_course_instances_join_id
UPDATE course_instances
SET
  join_id = SUBSTRING(
    MD5(RANDOM()::TEXT)
    FROM
      1 FOR 12
  )
WHERE
  join_id IS NULL
  AND id >= $start
  AND id <= $end;
