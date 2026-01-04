-- BLOCK select_enrolled_students_without_team
WITH
  students_in_teams AS (
    SELECT
      tu.*
    FROM
      team_users AS tu
      JOIN teams AS t ON (t.id = tu.team_id)
      JOIN team_configs AS tc ON (tc.id = t.team_config_id)
    WHERE
      tc.assessment_id = $assessment_id
      AND tc.deleted_at IS NULL
      AND t.deleted_at IS NULL
  )
SELECT
  u.*
FROM
  assessments AS a
  JOIN enrollments AS e ON e.course_instance_id = a.course_instance_id
  JOIN users AS u ON u.id = e.user_id
  LEFT JOIN students_in_teams AS sig ON (sig.user_id = u.id)
WHERE
  a.id = $assessment_id
  AND NOT users_is_instructor_in_course_instance (e.user_id, e.course_instance_id)
  AND sig.team_id IS NULL;
