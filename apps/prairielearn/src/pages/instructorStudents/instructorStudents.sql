-- BLOCK select_users_and_enrollments_for_course_instance
SELECT
  to_jsonb(u) AS user,
  to_jsonb(e) AS enrollment,
  COALESCE(
    (
      SELECT
        jsonb_agg(
          jsonb_build_object('id', sl.id, 'name', sl.name, 'color', sl.color)
          ORDER BY
            sl.name
        )
      FROM
        student_label_enrollments AS sle
        JOIN student_labels AS sl ON sl.id = sle.student_label_id
      WHERE
        sle.enrollment_id = e.id
        AND sl.deleted_at IS NULL
    ),
    '[]'::jsonb
  ) AS student_labels
FROM
  enrollments AS e
  LEFT JOIN users AS u ON (u.id = e.user_id)
WHERE
  e.course_instance_id = $course_instance_id
ORDER BY
  COALESCE(u.uid, e.pending_uid) ASC;
