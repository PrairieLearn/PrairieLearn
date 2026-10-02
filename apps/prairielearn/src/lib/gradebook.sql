-- BLOCK select_assessment_instances
SELECT
  to_jsonb(a.*) AS assessment,
  to_jsonb(ai.*) AS assessment_instance,
  to_jsonb(aset.*) AS assessment_set,
  aa.show_closed_assessment_score,
  aa.authorized,
  a.modern_access_control,
  a.id AS assessment_id
FROM
  assessments AS a
  JOIN course_instances AS ci ON (ci.id = a.course_instance_id)
  JOIN assessment_sets AS aset ON (aset.id = a.assessment_set_id)
  LEFT JOIN assessment_instances AS ai ON (
    ai.assessment_id = a.id
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
  )
  LEFT JOIN LATERAL authz_assessment (a.id, $authz_data, $req_date) AS aa ON TRUE
WHERE
  ci.id = $course_instance_id
  AND a.deleted_at IS NULL
  -- Only the student gradebook lists assessments with no instance yet.
  AND (
    $include_unstarted
    OR ai.id IS NOT NULL
  )
ORDER BY
  aset.number,
  a.order_by,
  a.id,
  ai.number;
