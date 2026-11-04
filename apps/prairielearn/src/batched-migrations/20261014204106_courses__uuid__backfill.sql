-- BLOCK update_courses_uuid
-- Include soft-deleted courses so historical provenance retains a course identity.
UPDATE courses
SET
  uuid = gen_random_uuid()
WHERE
  id >= $start
  AND id <= $end
  AND uuid IS NULL;
