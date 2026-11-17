-- BLOCK set_commit_hash
UPDATE courses
SET
  commit_hash = $hash
WHERE
  id = $courseId;

-- BLOCK advance_institution_sequence
SELECT
  setval(
    pg_get_serial_sequence('institutions', 'id'),
    (
      SELECT
        MAX(id)
      FROM
        institutions
    )
  );
