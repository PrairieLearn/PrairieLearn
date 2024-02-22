-- BLOCK select_assessment_access_policies
SELECT
  format_date_full_compact (aap.created_at, coalesce(ci.display_timezone, c.display_timezone)) AS created_at,
  aap.created_by::text AS created_by,
  aap.credit::text AS credit,
  format_date_full_compact (aap.end_date, coalesce(ci.display_timezone, c.display_timezone)) AS end_date,
  aap.note AS note,
  format_date_full_compact (aap.start_date, coalesce(ci.display_timezone, c.display_timezone)) AS start_date,
  (
    SELECT
      name
    from
      groups
    where
      id = aap.group_id
  ) as group_name,
  (
    SELECT
      uid
    FROM
      users
    WHERE
      user_id = aap.user_id
  ) as student_uid,
  aap.id as id
FROM
  assessment_access_policies AS aap
  LEFT JOIN course_instances AS ci ON (ci.id = $course_instance_id)
  LEFT JOIN pl_courses AS c ON (c.id = $course_id)
WHERE
  assessment_id = $assessment_id
ORDER BY
  aap.created_at;

-- BLOCK select_group_in_assessment
SELECT
  groups.id,
  groups.name,
  groups.group_config_id
FROM
  groups
  JOIN group_configs ON groups.group_config_id = group_configs.id
WHERE
  groups.course_instance_id = $course_instance_id
  AND groups.name = $group_name
  AND group_configs.assessment_id = $assessment_id;

-- BLOCK insert_assessment_access_policy
INSERT INTO
  assessment_access_policies (
    assessment_id,
    created_at,
    created_by,
    credit,
    end_date,
    group_id,
    note,
    start_date,
    user_id
  )
VALUES
  (
    $assessment_id,
    NOW(),
    $created_by,
    $credit,
    $end_date,
    $group_id,
    $note,
    $start_date,
    $user_id
  );

-- BLOCK update_assessment_access_policy
UPDATE assessment_access_policies
SET
  created_at = NOW(),
  credit = $credit,
  end_date = $end_date,
  group_id = $group_id,
  note = $note,
  start_date = $start_date,
  user_id = (
    SELECT
      user_id
    FROM
      users
    WHERE
      uid = $student_uid
  )
WHERE
  assessment_id = $assessment_id
  AND (
    user_id = (
      SELECT
        user_id
      FROM
        users
      WHERE
        uid = $student_uid
    )
  );

-- BLOCK delete_assessment_access_policy
DELETE FROM assessment_access_policies
WHERE
  id = $unsafe_assessment_access_policies_id
