-- BLOCK select_student_groups_with_counts
SELECT
  sg.id,
  sg.name,
  COUNT(sge.id)::integer AS student_count
FROM
  student_groups AS sg
  LEFT JOIN student_group_enrollments AS sge ON sge.student_group_id = sg.id
WHERE
  sg.course_instance_id = $course_instance_id
  AND sg.deleted_at IS NULL
GROUP BY
  sg.id
ORDER BY
  sg.name ASC;
