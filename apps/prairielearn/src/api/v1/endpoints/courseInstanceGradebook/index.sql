-- BLOCK select_user_scores
WITH
  course_assessments AS (
    SELECT
      a.id AS assessment_id,
      a.tid AS assessment_name,
      a.order_by AS assessment_order_by,
      aset.abbreviation AS assessment_set_abbreviation,
      a.number AS assessment_number,
      aset.number AS assessment_set_number,
      (aset.abbreviation || a.number) AS assessment_label
    FROM
      assessments AS a
      JOIN assessment_sets AS aset ON (aset.id = a.assessment_set_id)
    WHERE
      a.deleted_at IS NULL
      AND a.course_instance_id = $course_instance_id
  ),
  assessment_instances_with_groups AS (
    SELECT
      ai.id,
      COALESCE(ai.user_id, gu.user_id) AS user_id,
      ai.team_id,
      ai.assessment_id,
      ai.score_perc,
      ai.max_points,
      ai.points,
      ai.date,
      ai.duration
    FROM
      assessment_instances AS ai
      JOIN assessments AS a ON (a.id = ai.assessment_id)
      LEFT JOIN teams AS g ON (g.id = ai.team_id)
      LEFT JOIN team_users AS gu ON (gu.team_id = g.id)
    WHERE
      a.course_instance_id = $course_instance_id
      AND (
        g.deleted_at IS NULL
        OR g.id IS NULL
      )
  ),
  course_scores AS (
    SELECT DISTINCT
      ON (aig.user_id, aig.assessment_id) aig.user_id,
      aig.assessment_id,
      aig.score_perc,
      aig.max_points,
      aig.points,
      format_date_iso8601 (aig.date, ci.display_timezone) AS start_date,
      DATE_PART('epoch', aig.duration) AS duration_seconds,
      aig.id AS assessment_instance_id
    FROM
      assessment_instances_with_groups AS aig
      JOIN course_instances AS ci ON (ci.id = $course_instance_id)
    ORDER BY
      aig.user_id ASC,
      aig.assessment_id ASC,
      aig.score_perc DESC,
      aig.id DESC
  ),
  user_ids AS (
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
  ),
  course_users AS (
    SELECT
      u.id,
      u.uid,
      u.uin,
      u.name,
      users_get_displayed_role (u.id, $course_instance_id) AS role
    FROM
      user_ids
      JOIN users AS u ON (u.id = user_ids.user_id)
  ),
  scores AS (
    SELECT
      u.id AS user_id,
      u.uid AS user_uid,
      u.uin AS user_uin,
      u.name AS user_name,
      u.role AS user_role,
      a.assessment_id,
      a.assessment_name,
      a.assessment_label,
      a.assessment_order_by,
      a.assessment_set_abbreviation,
      a.assessment_number,
      a.assessment_set_number,
      s.score_perc,
      s.max_points,
      s.points,
      s.start_date,
      s.duration_seconds,
      s.assessment_instance_id
    FROM
      course_users AS u
      CROSS JOIN course_assessments AS a
      LEFT JOIN course_scores AS s ON (
        s.user_id = u.id
        AND s.assessment_id = a.assessment_id
      )
  )
SELECT
  user_id,
  user_uid,
  user_uin,
  user_name,
  user_role,
  ARRAY_AGG(
    jsonb_build_object(
      'assessment_id',
      assessment_id,
      'assessment_name',
      assessment_name,
      'assessment_label',
      assessment_label,
      'assessment_set_abbreviation',
      assessment_set_abbreviation,
      'assessment_number',
      assessment_number,
      'assessment_instance_id',
      assessment_instance_id,
      'score_perc',
      score_perc,
      'max_points',
      max_points,
      'points',
      points,
      'start_date',
      start_date,
      'duration_seconds',
      duration_seconds
    )
    ORDER BY
      (
        assessment_set_number,
        assessment_order_by,
        assessment_id
      )
  ) AS assessments
FROM
  scores
GROUP BY
  user_id,
  user_uid,
  user_uin,
  user_name,
  user_role
ORDER BY
  user_role DESC,
  user_uid ASC;
