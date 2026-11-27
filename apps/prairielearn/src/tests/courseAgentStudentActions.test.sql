-- BLOCK select_status
SELECT
  e.status
FROM
  enrollments AS e
  LEFT JOIN users AS u ON (u.id = e.user_id)
WHERE
  e.course_instance_id = 1
  AND (
    u.uid = $uid
    OR e.pending_uid = $uid
  );

-- BLOCK select_label_uids
SELECT
  u.uid
FROM
  student_labels AS sl
  JOIN student_label_enrollments AS sle ON (sle.student_label_id = sl.id)
  JOIN enrollments AS e ON (e.id = sle.enrollment_id)
  JOIN users AS u ON (u.id = e.user_id)
WHERE
  sl.course_instance_id = 1
  AND sl.name = $name
ORDER BY
  u.uid;

-- BLOCK select_extension
SELECT
  pe.*
FROM
  course_instance_publishing_extensions AS pe
WHERE
  pe.course_instance_id = 1
  AND pe.name = $name;

-- BLOCK select_extension_uids
SELECT
  u.uid
FROM
  course_instance_publishing_extension_enrollments AS pee
  JOIN enrollments AS e ON (e.id = pee.enrollment_id)
  JOIN users AS u ON (u.id = e.user_id)
WHERE
  pee.course_instance_publishing_extension_id = $extension_id
ORDER BY
  u.uid;
