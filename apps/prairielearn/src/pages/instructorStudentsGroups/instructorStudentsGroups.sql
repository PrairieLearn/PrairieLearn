-- BLOCK select_student_groups_with_user_data
SELECT
  to_jsonb(sg.*) AS student_group,
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
  student_groups AS sg
  LEFT JOIN student_group_enrollments AS sge ON sge.student_group_id = sg.id
  LEFT JOIN enrollments AS e ON e.id = sge.enrollment_id
  LEFT JOIN users AS u ON u.id = e.user_id
WHERE
  sg.course_instance_id = $course_instance_id
  AND sg.deleted_at IS NULL
GROUP BY
  sg.id
ORDER BY
  sg.name ASC;

-- BLOCK select_enrollment_ids_for_group
SELECT
  sge.enrollment_id
FROM
  student_group_enrollments AS sge
WHERE
  sge.student_group_id = $student_group_id;

-- BLOCK bulk_remove_enrollments_from_group
DELETE FROM student_group_enrollments
WHERE
  student_group_id = $student_group_id
  AND enrollment_id = ANY ($enrollment_ids::bigint[]);
