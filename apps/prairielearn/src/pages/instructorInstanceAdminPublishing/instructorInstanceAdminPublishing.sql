-- BLOCK course_instance_access_rules
SELECT
  ciar.*
FROM
  course_instance_access_rules AS ciar
WHERE
  ciar.course_instance_id = $course_instance_id
ORDER BY
  ciar.number;

-- BLOCK select_publishing_extensions_with_users_by_course_instance
SELECT
  to_jsonb(ci_extensions.*) AS course_instance_publishing_extension,
  COALESCE(
    jsonb_agg(
      jsonb_build_object(
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
    '[]'::jsonb
  ) AS user_data
FROM
  course_instance_publishing_extensions AS ci_extensions
  LEFT JOIN course_instance_publishing_extension_enrollments AS ci_enrollment_extensions ON (
    ci_enrollment_extensions.course_instance_publishing_extension_id = ci_extensions.id
  )
  LEFT JOIN enrollments AS e ON (e.id = ci_enrollment_extensions.enrollment_id)
  LEFT JOIN users AS u ON (u.id = e.user_id)
WHERE
  ci_extensions.course_instance_id = $course_instance_id
GROUP BY
  ci_extensions.id
ORDER BY
  ci_extensions.id;
