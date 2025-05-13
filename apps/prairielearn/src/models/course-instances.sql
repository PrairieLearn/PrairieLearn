-- BLOCK select_course_instance_by_id
SELECT
  ci.*
FROM
  course_instances AS ci
WHERE
  ci.id = $course_instance_id;

-- BLOCK select_course_instances_with_staff_access
SELECT
  ci.*,
  CASE
    WHEN d.start_date IS NULL THEN '—'
    ELSE format_date_full_compact (d.start_date, ci.display_timezone)
  END AS formatted_start_date,
  CASE
    WHEN d.end_date IS NULL THEN '—'
    ELSE format_date_full_compact (d.end_date, ci.display_timezone)
  END AS formatted_end_date,
  COALESCE(
    $is_administrator
    OR ia.id IS NOT NULL
    OR cip.course_instance_role > 'None',
    FALSE
  ) AS has_course_instance_permission_view,
  COALESCE(
    $is_administrator
    OR ia.id IS NOT NULL
    OR cip.course_instance_role >= 'Student Data Editor',
    FALSE
  ) AS has_course_instance_permission_edit
FROM
  pl_courses AS c
  JOIN institutions AS i ON (i.id = c.institution_id)
  LEFT JOIN institution_administrators AS ia ON (
    ia.institution_id = i.id
    AND ia.user_id = $user_id
  )
  JOIN course_instances AS ci ON (
    ci.course_id = c.id
    AND ci.deleted_at IS NULL
  )
  LEFT JOIN course_permissions AS cp ON (
    cp.user_id = $user_id
    AND cp.course_id = $course_id
  )
  LEFT JOIN course_instance_permissions AS cip ON (
    cip.course_permission_id = cp.id
    AND cip.course_instance_id = ci.id
  ),
  LATERAL (
    SELECT
      min(ar.start_date) AS start_date,
      max(ar.end_date) AS end_date
    FROM
      course_instance_access_rules AS ar
    WHERE
      ar.course_instance_id = ci.id
  ) AS d
WHERE
  c.id = $course_id
  AND c.deleted_at IS NULL
  -- If either the user is a global or institution administrator, the user has
  -- a non-None course role, or the course is the example course, then select all
  -- course instances. Otherwise, select all course instances for which the user
  -- has a non-None course instance role.
  AND (
    $is_administrator
    OR ia.id IS NOT NULL
    OR cp.course_role > 'None'
    OR cip.course_instance_role > 'None'
    OR c.example_course IS TRUE
  )
ORDER BY
  d.start_date DESC NULLS LAST,
  d.end_date DESC NULLS LAST,
  ci.id DESC;

-- BLOCK select_users_with_course_instance_access
SELECT
  u.*
FROM
  course_instance_permissions AS cip
  JOIN course_permissions AS cp ON (cp.id = cip.course_permission_id)
  JOIN users AS u ON (u.user_id = cp.user_id)
WHERE
  cip.course_instance_id = $course_instance_id
  AND cip.course_instance_role >= $minimal_role;

-- BLOCK select_course_has_course_instances
SELECT
  EXISTS (
    SELECT
      1
    FROM
      course_instances as ci
    WHERE
      ci.course_id = $course_id
      AND ci.deleted_at IS NULL
  );
  
-- BLOCK select_assessments
WITH
  issue_count AS (
    SELECT
      a.id AS assessment_id,
      count(*) AS open_issue_count
    FROM
      assessments AS a
      JOIN issues AS i ON (i.assessment_id = a.id)
    WHERE
      a.course_instance_id = $course_instance_id
      AND i.course_caused
      AND i.open
    GROUP BY
      a.id
  )
SELECT
  a.*,
  EXISTS (
    SELECT
      1
    FROM
      assessment_instances AS ai
    WHERE
      ai.assessment_id = a.id
      AND ai.modified_at > a.statistics_last_updated_at - interval '1 minute'
  ) AS needs_statistics_update,
  aset.abbreviation,
  aset.name,
  aset.color,
  (aset.abbreviation || a.number) as label,
  to_jsonb(aset) as assessment_set,
  to_jsonb(am) as assessment_module,
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
  coalesce(ic.open_issue_count, 0) AS open_issue_count
FROM
  assessments AS a
  JOIN course_instances AS ci ON (ci.id = a.course_instance_id)
  LEFT JOIN assessment_sets AS aset ON (aset.id = a.assessment_set_id)
  LEFT JOIN issue_count AS ic ON (ic.assessment_id = a.id)
  LEFT JOIN assessment_modules AS am ON (am.id = a.assessment_module_id)
WHERE
  ci.id = $course_instance_id
  AND a.deleted_at IS NULL
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
