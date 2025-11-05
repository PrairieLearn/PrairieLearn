-- BLOCK select_publishing_extension_by_id
SELECT
  *
FROM
  course_instance_publishing_extensions
WHERE
  id = $id;

-- BLOCK select_latest_publishing_extension_by_enrollment_id
SELECT
  ci_extensions.*
FROM
  course_instance_publishing_extensions AS ci_extensions
  JOIN course_instance_publishing_enrollment_extensions AS ci_enrollment_extensions ON (
    ci_enrollment_extensions.course_instance_publishing_extension_id = ci_extensions.id
  )
WHERE
  ci_enrollment_extensions.enrollment_id = $enrollment_id
ORDER BY
  ci_extensions.end_date DESC
LIMIT
  1;

-- BLOCK select_publishing_extension_by_name
SELECT
  *
FROM
  course_instance_publishing_extensions
WHERE
  course_instance_id = $course_instance_id
  AND name = $name;

-- BLOCK insert_publishing_extension
INSERT INTO
  course_instance_publishing_extensions (course_instance_id, name, end_date)
VALUES
  ($course_instance_id, $name, $end_date)
RETURNING
  *;

-- BLOCK insert_publishing_enrollment_extension
INSERT INTO
  course_instance_publishing_enrollment_extensions (
    course_instance_publishing_extension_id,
    enrollment_id
  )
VALUES
  (
    $course_instance_publishing_extension_id,
    $enrollment_id
  )
ON CONFLICT (
  course_instance_publishing_extension_id,
  enrollment_id
) DO NOTHING
RETURNING
  *;

-- BLOCK select_publishing_extensions_with_uids_by_course_instance
SELECT
  ci_extensions.*,
  COALESCE(
    json_agg(
      json_build_object(
        'uid',
        u.uid,
        'name',
        u.name,
        'enrollment_id',
        e.id
      )
      ORDER BY
        u.uid
    ) FILTER (
      WHERE
        u.uid IS NOT NULL
    ),
    '[]'::json
  ) AS user_data
FROM
  course_instance_publishing_extensions AS ci_extensions
  LEFT JOIN course_instance_publishing_enrollment_extensions AS ci_enrollment_extensions ON (
    ci_enrollment_extensions.course_instance_publishing_extension_id = ci_extensions.id
  )
  LEFT JOIN enrollments AS e ON (e.id = ci_enrollment_extensions.enrollment_id)
  LEFT JOIN users AS u ON (u.user_id = e.user_id)
WHERE
  ci_extensions.course_instance_id = $course_instance_id
GROUP BY
  ci_extensions.id
ORDER BY
  ci_extensions.id;

-- BLOCK delete_publishing_extension
DELETE FROM course_instance_publishing_extensions
WHERE
  id = $extension_id;

-- BLOCK update_publishing_extension
UPDATE course_instance_publishing_extensions
SET
  name = $name,
  end_date = $end_date
WHERE
  id = $extension_id
RETURNING
  *;
