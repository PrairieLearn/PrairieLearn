-- BLOCK select_and_auth
WITH
  instance_questions_info AS (
    SELECT
      iq.id,
      -- prev and next instance questions are JSON objects to pass directly 
      -- to partials that render links inside of instance question pages.
      jsonb_build_object('id', (lag(iq.id) OVER w)) AS prev_instance_question,
      jsonb_build_object(
        'id',
        (lead(iq.id) OVER w),
        'sequence_locked',
        (lead(qo.sequence_locked) OVER w)
      ) AS next_instance_question,
      qo.question_number,
      qo.sequence_locked
    FROM
      instance_questions AS this_iq
      JOIN assessment_instances AS ai ON (ai.id = this_iq.assessment_instance_id)
      JOIN assessments AS a ON (a.id = ai.assessment_id)
      JOIN instance_questions AS iq ON (iq.assessment_instance_id = ai.id)
      JOIN question_order (ai.id) AS qo ON (qo.instance_question_id = iq.id)
    WHERE
      this_iq.id = $instance_question_id
    WINDOW
      w AS (
        ORDER BY
          qo.row_order
      )
  ),
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
      f.instance_question_id = $instance_question_id
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
        LEAST(aai.exam_access_end, ai.date_limit) - $req_date::timestamptz
      ) * 1000
    )
  END AS assessment_instance_remaining_ms,
  CASE
    WHEN COALESCE(aai.exam_access_end, ai.date_limit) IS NOT NULL THEN floor(
      DATE_PART(
        'epoch',
        LEAST(aai.exam_access_end, ai.date_limit) - ai.date
      ) * 1000
    )
  END AS assessment_instance_time_limit_ms,
  (
    ai.date_limit IS NOT NULL
    AND ai.date_limit <= $req_date::timestamptz
  ) AS assessment_instance_time_limit_expired,
  to_jsonb(u) AS instance_user,
  users_get_displayed_role (u.user_id, ci.id) AS instance_role,
  to_jsonb(g) AS instance_group,
  groups_uid_list (g.id) AS instance_group_uid_list,
  to_jsonb(iq) || to_jsonb(iqnag) || jsonb_build_object(
    'assigned_grader_name',
    COALESCE(uag.name, uag.uid),
    'last_grader_name',
    COALESCE(ulg.name, ulg.uid),
    'modified_at_formatted',
    format_date_short (iq.modified_at, ci.display_timezone)
  ) AS instance_question,
  jsonb_build_object(
    'id',
    iqi.id,
    'prev_instance_question',
    iqi.prev_instance_question,
    'next_instance_question',
    iqi.next_instance_question,
    'question_number',
    iqi.question_number,
    'advance_score_perc',
    aq.effective_advance_score_perc,
    'sequence_locked',
    iqi.sequence_locked,
    'instructor_question_number',
    admin_assessment_question_number (aq.id)
  ) AS instance_question_info,
  to_jsonb(aq) AS assessment_question,
  to_jsonb(q) AS question,
  to_jsonb(a) AS assessment,
  to_jsonb(aset) AS assessment_set,
  to_jsonb(aai) AS authz_result,
  assessment_instance_label (ai, a, aset) AS assessment_instance_label,
  fl.list AS file_list
FROM
  instance_questions AS iq
  JOIN instance_questions_info AS iqi ON (iqi.id = iq.id)
  JOIN assessment_questions AS aq ON (aq.id = iq.assessment_question_id)
  JOIN questions AS q ON (q.id = aq.question_id)
  JOIN assessment_instances AS ai ON (ai.id = iq.assessment_instance_id)
  JOIN assessments AS a ON (a.id = ai.assessment_id)
  JOIN course_instances AS ci ON (ci.id = a.course_instance_id)
  JOIN assessment_sets AS aset ON (aset.id = a.assessment_set_id)
  LEFT JOIN groups AS g ON (
    g.id = ai.group_id
    AND g.deleted_at IS NULL
  )
  LEFT JOIN users AS u ON (u.user_id = ai.user_id)
  LEFT JOIN users AS uag ON (uag.user_id = iq.assigned_grader)
  LEFT JOIN users AS ulg ON (ulg.user_id = iq.last_grader)
  JOIN LATERAL authz_assessment_instance (
    ai.id,
    $authz_data,
    $req_date,
    ci.display_timezone,
    a.group_work
  ) AS aai ON TRUE
  JOIN LATERAL instance_questions_next_allowed_grade (iq.id) AS iqnag ON TRUE
  CROSS JOIN file_list AS fl
WHERE
  iq.id = $instance_question_id
  AND ci.id = $course_instance_id
  AND (
    $assessment_id::BIGINT IS NULL
    OR a.id = $assessment_id
  )
  AND q.deleted_at IS NULL
  AND a.deleted_at IS NULL
  AND aai.authorized
  AND NOT iqi.sequence_locked;
