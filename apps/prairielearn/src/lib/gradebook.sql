-- BLOCK select_assessment_instances
WITH
  user_teams AS (
    SELECT
      g.id
    FROM
      teams AS g
      JOIN team_users AS gu ON g.id = gu.team_id
    WHERE
      g.deleted_at IS NULL
      AND gu.user_id = $user_id
  ),
  rows AS (
    SELECT
      to_jsonb(a.*) AS assessment,
      to_jsonb(ai.*) AS assessment_instance,
      to_jsonb(aset.*) AS assessment_set,
      aa.show_closed_assessment_score,
      aa.authorized,
      a.modern_access_control,
      a.id AS assessment_id,
      aset.number AS set_number,
      a.order_by,
      ai.number AS instance_number
    FROM
      assessment_instances AS ai
      JOIN assessments AS a ON (a.id = ai.assessment_id)
      JOIN course_instances AS ci ON (ci.id = a.course_instance_id)
      JOIN assessment_sets AS aset ON (aset.id = a.assessment_set_id)
      LEFT JOIN LATERAL authz_assessment (a.id, $authz_data, $req_date) AS aa ON TRUE
    WHERE
      ci.id = $course_instance_id
      AND (
        ai.user_id = $user_id
        OR ai.team_id IN (
          SELECT
            id
          FROM
            user_teams
        )
      )
      AND a.deleted_at IS NULL
    UNION ALL
    -- Assessments the user has not started. Only the student gradebook asks
    -- for these. Availability is filtered by the caller.
    SELECT
      to_jsonb(a.*) AS assessment,
      NULL::jsonb AS assessment_instance,
      to_jsonb(aset.*) AS assessment_set,
      aa.show_closed_assessment_score,
      aa.authorized,
      a.modern_access_control,
      a.id AS assessment_id,
      aset.number AS set_number,
      a.order_by,
      0 AS instance_number
    FROM
      assessments AS a
      JOIN course_instances AS ci ON (ci.id = a.course_instance_id)
      JOIN assessment_sets AS aset ON (aset.id = a.assessment_set_id)
      LEFT JOIN LATERAL authz_assessment (a.id, $authz_data, $req_date) AS aa ON TRUE
    WHERE
      $include_unstarted
      AND ci.id = $course_instance_id
      AND a.deleted_at IS NULL
      AND NOT EXISTS (
        SELECT
          1
        FROM
          assessment_instances AS ai
        WHERE
          ai.assessment_id = a.id
          AND (
            ai.user_id = $user_id
            OR ai.team_id IN (
              SELECT
                id
              FROM
                user_teams
            )
          )
      )
  )
SELECT
  *
FROM
  rows
ORDER BY
  set_number,
  order_by,
  assessment_id,
  instance_number;
