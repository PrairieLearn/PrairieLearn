-- BLOCK lock_enrollments_by_id
SELECT
  id
FROM
  enrollments
WHERE
  id = ANY ($enrollment_ids::bigint[])
ORDER BY
  id
FOR UPDATE;
