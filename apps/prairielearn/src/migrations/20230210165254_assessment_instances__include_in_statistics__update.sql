WITH
  assessment_instances_with_users AS (
    -- Get all assessment instances with all users who own them, either directly
    -- or via group membership. Note that a single assessment instance can
    -- appear multiple times, once for each group user.
    SELECT
      ai.id AS assessment_instance_id,
      coalesce(ai.user_id, gu.user_id) AS user_id
    FROM
      assessment_instances AS ai
      JOIN assessments AS a ON (a.id = ai.assessment_id)
      JOIN course_instances AS ci ON (ci.id = a.course_instance_id)
      LEFT JOIN groups AS g ON (
        g.id = ai.group_id
        AND g.deleted_at IS NULL
      )
      LEFT JOIN group_users AS gu ON (gu.group_id = g.id)
  ),
  instructor_assessment_instances AS (
    -- For each of the previous assessment instances with users, select only the
    -- ones with users who are instructors in the course, copying the logic from
    -- sprocs/users_is_instructor_in_course_instance.sql. Then only keep
    -- distinct assessment instances.
    SELECT DISTINCT
      aiwu.assessment_instance_id
    FROM
      assessment_instances_with_users AS aiwu
      JOIN assessment_instances AS ai ON (ai.id = aiwu.assessment_instance_id)
      JOIN assessments AS a ON (a.id = ai.assessment_id)
      JOIN users AS u ON (u.user_id = aiwu.user_id)
      JOIN course_instances AS ci ON (ci.id = a.course_instance_id)
      LEFT JOIN administrators AS adm ON (adm.user_id = u.user_id)
      LEFT JOIN course_permissions AS cp ON (
        cp.user_id = u.user_id
        AND cp.course_id = ci.course_id
      )
      LEFT JOIN course_instance_permissions AS cip ON (
        cip.course_permission_id = cp.id
        AND cip.course_instance_id = ci.id
      )
    WHERE
      adm.id IS NOT NULL
      OR cp.course_role > 'None'
      OR cip.course_instance_role > 'None'
  )
UPDATE assessment_instances AS ai
-- For each of the assessment instances that are owned by an instructor user, set
-- include_in_statistics to be FALSE.
SET
  include_in_statistics = FALSE
FROM
  instructor_assessment_instances AS iai
WHERE
  ai.id = iai.assessment_instance_id;
