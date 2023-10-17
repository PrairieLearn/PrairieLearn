-- BLOCK select_assessment_instances
SELECT
  a.id AS assessment_id,
  a.number AS assessment_number,
  a.order_by AS assessment_order_by,
  a.group_work AS assessment_group_work,
  CASE
    WHEN a.multiple_instance THEN a.title || ' instance #' || ai.number
    ELSE a.title
  END AS title,
  aset.id AS assessment_set_id,
  aset.abbreviation AS assessment_set_abbreviation,
  aset.name AS assessment_set_name,
  aset.heading AS assessment_set_heading,
  aset.color AS assessment_set_color,
  aset.number AS assessment_set_number,
  CASE
    WHEN a.multiple_instance THEN aset.abbreviation || a.number || '#' || ai.number
    ELSE aset.abbreviation || a.number
  END AS label,
  ai.id AS assessment_instance_id,
  ai.number AS assessment_instance_number,
  ai.score_perc AS assessment_instance_score_perc,
  ai.open AS assessment_instance_open,
  aa.show_closed_assessment_score,
  (
    lag(assessment_set_id) OVER (
      PARTITION BY
        aset.id
      ORDER BY
        a.order_by,
        a.id,
        ai.number
    ) IS NULL
  ) AS start_new_set
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
    OR ai.group_id IN (
      SELECT
        g.id
      FROM
        groups g
        JOIN group_users AS gu ON g.id = gu.group_id
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
