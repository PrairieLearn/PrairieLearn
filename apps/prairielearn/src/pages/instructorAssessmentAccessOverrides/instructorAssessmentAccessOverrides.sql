-- BLOCK select_assessment_access_policies
SELECT
  aap.created_at,
  (
    SELECT
      uid
    FROM
      users
    WHERE
      user_id = aap.created_by
  ) AS created_by,
  aap.start_date,
  aap.end_date,
  aap.note AS note,
  aap.credit::text AS credit,
  (
    SELECT
      name
    FROM
      groups
    WHERE
      id = aap.group_id
  ) AS group_name,
  (
    SELECT
      uid
    FROM
      users
    WHERE
      user_id = aap.user_id
  ) AS user_uid,
  aap.id AS id
FROM
  assessment_access_policies AS aap
  JOIN assessments AS a ON (a.id = aap.assessment_id)
  JOIN course_instances AS ci ON (ci.id = a.course_instance_id)
  JOIN pl_courses AS c ON (c.id = ci.course_id)
WHERE
  assessment_id = $assessment_id
ORDER BY
  aap.created_at DESC;

-- BLOCK select_assessment_access_policy
SELECT
  *
FROM
  assessment_access_policies
WHERE
  id = $policy_id;

-- BLOCK select_group_in_assessment
SELECT
  g.id
FROM
  groups AS g
  JOIN group_configs AS gc ON (g.group_config_id = gc.id)
WHERE
  g.course_instance_id = $course_instance_id
  AND g.name = $group_name
  AND gc.assessment_id = $assessment_id;

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
    $end_date::timestamp AT TIME ZONE $timezone,
    $group_id,
    $note,
    $start_date::timestamp AT TIME ZONE $timezone,
    $user_id
  )
RETURNING
  *;

-- BLOCK update_assessment_access_policy
UPDATE assessment_access_policies
SET
  credit = $credit,
  end_date = $end_date::timestamp AT TIME ZONE $timezone,
  group_id = $group_id,
  note = $note,
  start_date = $start_date::timestamp AT TIME ZONE $timezone,
  user_id = $user_id
WHERE
  assessment_id = $assessment_id
  AND id = $assessment_access_policies_id
RETURNING
  *;

-- BLOCK delete_assessment_access_policy
DELETE FROM assessment_access_policies
WHERE
  assessment_id = $assessment_id
  AND id = $unsafe_assessment_access_policies_id
RETURNING
  *;
