-- BLOCK select_assessment_instances
SELECT
  to_jsonb(a.*) AS assessment,
  to_jsonb(ai.*) AS assessment_instance,
  to_jsonb(aset.*) AS assessment_set,
  aa.show_closed_assessment_score
FROM
  assessment_instances AS ai
  JOIN assessments AS a ON (a.id = ai.assessment_id)
  JOIN course_instances AS ci ON (ci.id = a.course_instance_id)
  JOIN assessment_sets AS aset ON (aset.id = a.assessment_set_id)
  LEFT JOIN LATERAL authz_assessment (a.id, $authz_data, $req_date, ci.display_timezone) AS aa ON TRUE
WHERE
  ci.id = $course_instance_id
  AND (
    ai.user_id = $user_id
    OR ai.team_id IN (
      SELECT
        g.id
      FROM
        teams AS g
        JOIN team_users AS gu ON g.id = gu.team_id
      WHERE
        g.deleted_at IS NULL
        AND gu.user_id = $user_id
    )
  )
  AND a.deleted_at IS NULL
ORDER BY
  aset.number,
  a.order_by,
  a.id,
  ai.number;
