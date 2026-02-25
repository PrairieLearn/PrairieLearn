-- BLOCK select_courses
SELECT
  c.*,
  to_jsonb(i.*) AS institution
FROM
  courses AS c
  JOIN institutions AS i ON (i.id = c.institution_id)
WHERE
  c.deleted_at IS NULL;

-- BLOCK courses_update_column
SELECT
  courses_update_column (
    $course_id,
    $column_name,
    $value,
    $authn_user_id
  );
