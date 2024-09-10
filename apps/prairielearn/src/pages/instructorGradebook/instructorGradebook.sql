-- BLOCK course_assessments
SELECT
  a.id AS assessment_id,
  a.number AS assessment_number,
  aset.number AS assessment_set_number,
  aset.color,
  (aset.abbreviation || a.number) AS label
FROM
  assessments AS a
  JOIN assessment_sets AS aset ON (aset.id = a.assessment_set_id)
WHERE
  a.deleted_at IS NULL
  AND a.course_instance_id = $course_instance_id
ORDER BY
  (aset.number, a.order_by, a.id);

-- BLOCK user_scores
WITH
  course_assessment_instances AS (
    -- Select all assessment instances for the course instance
    SELECT
      ai.id,
      COALESCE(ai.user_id, gu.user_id) AS user_id,
      ai.group_id,
      ai.assessment_id,
      ai.score_perc
    FROM
      assessment_instances AS ai
      JOIN assessments AS a ON (a.id = ai.assessment_id)
      LEFT JOIN groups AS g ON (g.id = ai.group_id)
      LEFT JOIN group_users AS gu ON (gu.group_id = g.id)
    WHERE
      a.course_instance_id = $course_instance_id
      AND g.deleted_at IS NULL
  ),
  course_scores AS (
    -- For each user, select the instance with the highest score for each assessment
    SELECT DISTINCT
      ON (cai.user_id, cai.assessment_id) cai.user_id,
      cai.assessment_id,
      cai.score_perc,
      cai.id AS assessment_instance_id,
      cai.group_id
    FROM
      course_assessment_instances AS cai
    ORDER BY
      cai.user_id,
      cai.assessment_id,
      cai.score_perc DESC,
      cai.id
  ),
  user_ids AS (
    -- Select all users that:
    -- 1. Are enrolled in the course instance;
    -- 2. Have at least one assessment instance in the course (typically previously enrolled);
    -- 3. Have some staff permission in the course or instance.
    (
      SELECT DISTINCT
        user_id
      FROM
        course_scores
    )
    UNION
    (
      SELECT
        user_id
      FROM
        enrollments
      WHERE
        course_instance_id = $course_instance_id
    )
    UNION
    (
      SELECT
        user_id
      FROM
        course_permissions
      WHERE
        course_id = $course_id
        AND course_role > 'None'
    )
    UNION
    (
      SELECT
        cp.user_id
      FROM
        course_instance_permissions cip
        JOIN course_permissions cp ON (cp.id = cip.course_permission_id)
      WHERE
        cip.course_instance_id = $course_instance_id
        AND cip.course_instance_role > 'None'
    )
  ),
  course_users AS (
    -- Retrieve user data for each user
    SELECT
      u.user_id,
      u.uid,
      u.uin,
      u.name AS user_name,
      users_get_displayed_role (u.user_id, $course_instance_id) AS role
    FROM
      user_ids
      JOIN users AS u ON (u.user_id = user_ids.user_id)
  ),
  user_scores AS (
    -- Aggregate scores for each user
    SELECT
      u.user_id,
      JSONB_OBJECT_AGG(
        s.assessment_id,
        json_build_object(
          'score_perc',
          s.score_perc,
          'assessment_instance_id',
          s.assessment_instance_id,
          'uid_other_users_group',
          ARRAY(
            SELECT
              ou.uid
            FROM
              group_users AS ogu
              LEFT JOIN course_users AS ou ON (ou.user_id = ogu.user_id)
            WHERE
              ogu.group_id = s.group_id
              AND ogu.user_id != u.user_id
          )
        )
      ) AS scores
    FROM
      course_users AS u
      JOIN course_scores AS s ON (s.user_id = u.user_id)
    GROUP BY
      u.user_id
  )
SELECT
  u.user_id,
  u.uid,
  u.uin,
  u.user_name,
  u.role,
  COALESCE(s.scores, '{}') AS scores
FROM
  course_users AS u
  LEFT JOIN user_scores AS s ON (u.user_id = s.user_id)
ORDER BY
  role DESC,
  uid;

-- BLOCK assessment_instance_score
SELECT
  COALESCE(ai.user_id, gu.user_id) AS user_id,
  ai.assessment_id,
  ai.score_perc,
  ai.id AS assessment_instance_id
FROM
  assessment_instances AS ai
  LEFT JOIN groups AS g ON (g.id = ai.group_id)
  LEFT JOIN group_users AS gu ON (gu.group_id = g.id)
WHERE
  ai.id = $assessment_instance_id
