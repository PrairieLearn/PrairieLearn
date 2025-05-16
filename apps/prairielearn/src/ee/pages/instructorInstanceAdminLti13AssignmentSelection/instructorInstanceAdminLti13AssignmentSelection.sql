-- BLOCK select_lti13_instance
SELECT
  to_jsonb(lci) AS lti13_course_instance,
  to_jsonb(li) AS lti13_instance
FROM
  lti13_course_instances AS lci
  JOIN lti13_instances li ON lci.lti13_instance_id = li.id
WHERE
  course_instance_id = $course_instance_id
  AND lci.id = $unsafe_lti13_course_instance_id
  AND li.deleted_at IS NULL;

-- BLOCK select_assessments
SELECT
  a.*,
  la.lineitem,
  aset.abbreviation,
  aset.name,
  aset.color,
  (aset.abbreviation || a.number) as label,
  (
    LAG(
      CASE
        WHEN $assessments_group_by = 'Set' THEN aset.id
        ELSE am.id
      END
    ) OVER (
      PARTITION BY
        (
          CASE
            WHEN $assessments_group_by = 'Set' THEN aset.id
            ELSE am.id
          END
        )
      ORDER BY
        aset.number,
        a.order_by,
        a.id
    ) IS NULL
  ) AS start_new_assessment_group,
  (
    CASE
      WHEN $assessments_group_by = 'Set' THEN aset.heading
      ELSE am.heading
    END
  ) AS assessment_group_heading
FROM
  assessments AS a
  JOIN course_instances AS ci ON (ci.id = a.course_instance_id)
  LEFT JOIN assessment_sets AS aset ON (aset.id = a.assessment_set_id)
  LEFT JOIN LATERAL authz_assessment (a.id, $authz_data, $req_date, ci.display_timezone) AS aa ON TRUE
  LEFT JOIN assessment_modules AS am ON (am.id = a.assessment_module_id)
  LEFT JOIN lti13_assessments as la ON (la.assessment_id = a.id)
WHERE
  ci.id = $course_instance_id
  AND a.deleted_at IS NULL
  AND aa.authorized
ORDER BY
  (
    CASE
      WHEN $assessments_group_by = 'Module' THEN am.number
    END
  ),
  (
    CASE
      WHEN $assessments_group_by = 'Module' THEN am.id
    END
  ),
  aset.number,
  a.order_by,
  a.id;

-- BLOCK select_assessment_in_course_instance
SELECT
  *
FROM
  assessments
WHERE
  id = $unsafe_assessment_id
  AND course_instance_id = $course_instance_id
  AND deleted_at IS NULL;
