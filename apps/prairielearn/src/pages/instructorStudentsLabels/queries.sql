-- BLOCK select_student_labels_with_user_data
SELECT
  to_jsonb(sl.*) AS student_label,
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
  student_labels AS sl
  LEFT JOIN student_label_enrollments AS sle ON sle.student_label_id = sl.id
  LEFT JOIN enrollments AS e ON e.id = sle.enrollment_id
  LEFT JOIN users AS u ON u.id = e.user_id
WHERE
  sl.course_instance_id = $course_instance_id
GROUP BY
  sl.id
ORDER BY
  sl.name ASC;
