-- BLOCK select_users_and_enrollments_for_course_instance
SELECT
  to_jsonb(u) AS user,
  to_jsonb(e) AS enrollment,
  COALESCE(
    (
      SELECT
        jsonb_agg(
          jsonb_build_object('id', sg.id, 'name', sg.name, 'color', sg.color)
          ORDER BY
            sg.name
        )
      FROM
        student_group_enrollments AS sge
        JOIN student_groups AS sg ON sg.id = sge.student_group_id
      WHERE
        sge.enrollment_id = e.id
        AND sg.deleted_at IS NULL
    ),
    '[]'::jsonb
  ) AS student_groups
FROM
  enrollments AS e
  LEFT JOIN users AS u ON (u.id = e.user_id)
WHERE
  e.course_instance_id = $course_instance_id
ORDER BY
  COALESCE(u.uid, e.pending_uid) ASC;
