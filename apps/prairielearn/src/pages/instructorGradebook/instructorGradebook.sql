-- BLOCK course_assessments
SELECT
  a.id AS assessment_id,
  a.number AS assessment_number,
  aset.number AS assessment_set_number,
  aset.id AS assessment_set_id,
  aset.color,
  aset.name AS assessment_set_name,
  aset.heading AS assessment_set_heading,
  (aset.abbreviation || a.number) AS label,
  a.max_points
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
      ai.team_id,
      ai.assessment_id,
      ai.score_perc,
      ai.points,
      ai.max_points
    FROM
      assessment_instances AS ai
      JOIN assessments AS a ON (a.id = ai.assessment_id)
      LEFT JOIN teams AS g ON (g.id = ai.team_id)
      LEFT JOIN team_users AS gu ON (gu.team_id = g.id)
    WHERE
      a.course_instance_id = $course_instance_id
      AND g.deleted_at IS NULL
  ),
  course_scores AS (
    -- For each user, select the instance with the highest score for each assessment
    SELECT DISTINCT
      ON (cai.user_id, cai.assessment_id) cai.id AS assessment_instance_id,
      cai.user_id,
      cai.assessment_id,
      cai.score_perc,
      cai.points,
      cai.max_points,
      cai.team_id
    FROM
      course_assessment_instances AS cai
    ORDER BY
      cai.user_id ASC,
      cai.assessment_id ASC,
      cai.score_perc DESC,
      cai.id DESC
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
      u.id,
      u.uid,
      u.uin,
      u.name AS user_name,
      users_get_displayed_role (u.id, $course_instance_id) AS role
    FROM
      user_ids
      JOIN users AS u ON (u.id = user_ids.user_id)
  ),
  user_scores AS (
    -- Aggregate scores for each user
    SELECT
      u.id AS user_id,
      JSONB_OBJECT_AGG(
        s.assessment_id,
        jsonb_build_object(
          'score_perc',
          s.score_perc,
          'points',
          s.points,
          'max_points',
          s.max_points,
          'assessment_instance_id',
          s.assessment_instance_id,
          'uid_other_users_group',
          COALESCE(
            (
              SELECT
                jsonb_agg(
                  jsonb_build_object('uid', ou.uid, 'enrollment_id', e.id)
                )
              FROM
                team_users AS ogu
                LEFT JOIN course_users AS ou ON (ou.id = ogu.user_id)
                LEFT JOIN enrollments AS e ON (
                  ou.id = e.user_id
                  AND e.course_instance_id = $course_instance_id
                )
              WHERE
                ogu.team_id = s.team_id
                AND ogu.user_id != u.id
            ),
            '[]'::jsonb
          )
        )
      ) AS scores
    FROM
      course_users AS u
      JOIN course_scores AS s ON (s.user_id = u.id)
    GROUP BY
      u.id
  ),
  student_label_agg AS (
    SELECT
      sle.enrollment_id,
      jsonb_agg(
        sle.student_label_id
        ORDER BY
          sle.student_label_id
      ) AS student_label_ids
    FROM
      student_label_enrollments sle
      JOIN enrollments e ON e.id = sle.enrollment_id
    WHERE
      e.course_instance_id = $course_instance_id
    GROUP BY
      sle.enrollment_id
  )
SELECT
  u.id AS user_id,
  u.uid,
  u.uin,
  u.user_name,
  u.role,
  to_jsonb(e.*) AS enrollment,
  COALESCE(s.scores, '{}') AS scores,
  COALESCE(sla.student_label_ids, '[]'::jsonb) AS student_label_ids
FROM
  course_users AS u
  LEFT JOIN enrollments AS e ON (
    e.user_id = u.id
    AND e.course_instance_id = $course_instance_id
  )
  LEFT JOIN user_scores AS s ON (u.id = s.user_id)
  LEFT JOIN student_label_agg sla ON sla.enrollment_id = e.id
ORDER BY
  role DESC,
  uid ASC;

-- BLOCK assessment_instance_score
SELECT
  COALESCE(ai.user_id, gu.user_id) AS user_id,
  ai.assessment_id,
  ai.score_perc,
  ai.id AS assessment_instance_id
FROM
  assessment_instances AS ai
  LEFT JOIN teams AS g ON (g.id = ai.team_id)
  LEFT JOIN team_users AS gu ON (gu.team_id = g.id)
WHERE
  ai.id = $assessment_instance_id;
