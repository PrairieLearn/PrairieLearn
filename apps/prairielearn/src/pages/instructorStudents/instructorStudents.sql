-- BLOCK select_users_and_enrollments_for_course_instance
WITH
  student_label_agg AS (
    SELECT
      sle.enrollment_id,
      jsonb_agg(
        to_jsonb(sl.*)
        ORDER BY
          sl.name
      ) AS student_labels
    FROM
      student_label_enrollments AS sle
      JOIN student_labels AS sl ON sl.id = sle.student_label_id
      JOIN enrollments AS e ON e.id = sle.enrollment_id
    WHERE
      e.course_instance_id = $course_instance_id
    GROUP BY
      sle.enrollment_id
  )
SELECT
  to_jsonb(u) AS user,
  to_jsonb(e) AS enrollment,
  COALESCE(sla.student_labels, '[]'::jsonb) AS student_labels
FROM
  enrollments AS e
  LEFT JOIN users AS u ON (u.id = e.user_id)
  LEFT JOIN student_label_agg sla ON sla.enrollment_id = e.id
WHERE
  e.course_instance_id = $course_instance_id
ORDER BY
  COALESCE(u.uid, e.pending_uid) ASC;
