-- BLOCK select_and_auth
WITH
  file_list AS (
    SELECT
      coalesce(
        jsonb_agg(
          f
          ORDER BY
            f.created_at
        ),
        '[]'::jsonb
      ) AS list
    FROM
      files AS f
    WHERE
      f.assessment_instance_id = $assessment_instance_id
      AND f.instance_question_id IS NULL
      AND f.deleted_at IS NULL
  )
SELECT
  jsonb_set(
    to_jsonb(ai),
    '{formatted_date}',
    to_jsonb(
      format_date_full_compact (ai.date, ci.display_timezone)
    )
  ) AS assessment_instance,
  CASE
    WHEN COALESCE(aai.exam_access_end, ai.date_limit) IS NOT NULL THEN floor(
      DATE_PART(
        'epoch',
        (
          LEAST(aai.exam_access_end, ai.date_limit) - $req_date::timestamptz
        )
      ) * 1000
    )
  END AS assessment_instance_remaining_ms,
  CASE
    WHEN COALESCE(aai.exam_access_end, ai.date_limit) IS NOT NULL THEN floor(
      DATE_PART(
        'epoch',
        (
          LEAST(aai.exam_access_end, ai.date_limit) - ai.date
        )
      ) * 1000
    )
  END AS assessment_instance_time_limit_ms,
  (
    ai.date_limit IS NOT NULL
    AND ai.date_limit <= $req_date::timestamptz
  ) AS assessment_instance_time_limit_expired,
  to_jsonb(u) AS instance_user,
  users_get_displayed_role (u.user_id, ci.id) AS instance_role,
  to_jsonb(a) AS assessment,
  to_jsonb(aset) AS assessment_set,
  to_jsonb(aai) AS authz_result,
  assessment_instance_label (ai, a, aset) AS assessment_instance_label,
  assessment_label (a, aset) AS assessment_label,
  fl.list AS file_list,
  to_jsonb(g) AS instance_group,
  groups_uid_list (g.id) AS instance_group_uid_list
FROM
  assessment_instances AS ai
  JOIN assessments AS a ON (a.id = ai.assessment_id)
  JOIN course_instances AS ci ON (ci.id = a.course_instance_id)
  JOIN assessment_sets AS aset ON (aset.id = a.assessment_set_id)
  LEFT JOIN groups AS g ON (g.id = ai.group_id) -- Ignore deleted_at, as we want to show the group even if it's deleted
  LEFT JOIN users AS u ON (u.user_id = ai.user_id) -- Only used for non-group instances
  JOIN LATERAL authz_assessment_instance (
    ai.id,
    $authz_data,
    $req_date,
    ci.display_timezone,
    a.group_work
  ) AS aai ON TRUE
  CROSS JOIN file_list AS fl
WHERE
  ai.id = $assessment_instance_id
  AND ci.id = $course_instance_id
  AND aai.authorized;
