-- BLOCK select_all_courses
SELECt
  *
FROM
  pl_courses
WHERE
  deleted_at IS NULL;
