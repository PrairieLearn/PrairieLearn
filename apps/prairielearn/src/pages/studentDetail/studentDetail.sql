-- BLOCK select_student_info
SELECT
  to_jsonb(u.*) AS user,
  users_get_displayed_role(u.user_id, $course_instance_id) AS role,
  format_date_iso8601(e.created_at, ci.display_timezone) AS enrollment_date
FROM
  users AS u
  JOIN course_instances AS ci ON (ci.id = $course_instance_id)
  LEFT JOIN enrollments AS e ON (e.user_id = u.user_id AND e.course_instance_id = $course_instance_id)
WHERE
  u.user_id = $user_id
  AND (
    -- Student must be enrolled or have staff permissions
    e.id IS NOT NULL
    OR users_is_instructor_in_course_instance(u.user_id, $course_instance_id)
  );

-- BLOCK select_student_assessments
SELECT
  a.id AS assessment_id,
  ai.id AS assessment_instance_id,
  aset.heading AS assessment_set_heading,
  aset.color AS assessment_set_color,
  a.title AS assessment_title,
  a.number AS assessment_number,
  (aset.abbreviation || a.number) AS assessment_label,
  ai.score_perc,
  ai.max_points,
  ai.points,
  aa.show_closed_assessment_score,
  a.group_work AS assessment_group_work
FROM
  assessments AS a
  JOIN assessment_sets AS aset ON (aset.id = a.assessment_set_id)
  JOIN course_instances AS ci ON (ci.id = a.course_instance_id)
  LEFT JOIN assessment_instances AS ai ON (
    ai.assessment_id = a.id
    AND (
      ai.user_id = $user_id
      OR ai.group_id IN (
        SELECT
          g.id
        FROM
          groups g
          JOIN group_users AS gu ON g.id = gu.group_id
        WHERE
          g.deleted_at IS NULL
          AND gu.user_id = $user_id
      )
    )
  )
  LEFT JOIN LATERAL authz_assessment(a.id, $authz_data, $req_date, ci.display_timezone) AS aa ON TRUE
WHERE
  ci.id = $course_instance_id
  AND a.deleted_at IS NULL
ORDER BY
  aset.number,
  a.order_by,
  a.id;
