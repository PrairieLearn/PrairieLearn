-- BLOCK course_instance_access_rules
SELECT
  ciar.*
FROM
  course_instance_access_rules AS ciar
WHERE
  ciar.course_instance_id = $course_instance_id
ORDER BY
  ciar.number;

-- BLOCK remove_student_from_extension
DELETE FROM course_instance_publishing_enrollment_extensions
WHERE
  course_instance_publishing_extension_id = $extension_id
  AND enrollment_id = $enrollment_id;

-- BLOCK update_publishing_extension_name
UPDATE course_instance_publishing_extensions
SET
  name = $name
WHERE
  id = $extension_id
  AND course_instance_id = $course_instance_id;

-- BLOCK update_publishing_extension_date
UPDATE course_instance_publishing_extensions
SET
  archive_date = CASE
    WHEN $archive_date = '' THEN NULL
    ELSE $archive_date::timestamp
  END
WHERE
  id = $extension_id
  AND course_instance_id = $course_instance_id;

-- BLOCK update_extension
UPDATE course_instance_publishing_extensions
SET
  name = $name,
  archive_date = CASE
    WHEN $archive_date = '' THEN NULL
    ELSE $archive_date::timestamp
  END
WHERE
  id = $extension_id
  AND course_instance_id = $course_instance_id;

-- BLOCK add_user_to_extension
INSERT INTO
  course_instance_publishing_enrollment_extensions (
    course_instance_publishing_extension_id,
    enrollment_id
  )
VALUES
  ($extension_id, $enrollment_id)
ON CONFLICT (
  course_instance_publishing_extension_id,
  enrollment_id
) DO NOTHING;
