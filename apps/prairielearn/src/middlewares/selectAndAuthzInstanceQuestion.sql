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
        'question_access_mode',
        (lead(qo.question_access_mode) OVER w)
      ) AS next_instance_question,
      qo.question_number,
      qo.question_access_mode
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
  users_get_displayed_role (u.id, ci.id) AS instance_role,
  to_jsonb(g) AS instance_group,
  teams_uid_list (g.id) AS instance_group_uid_list,
  to_jsonb(iq) AS instance_question,
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
    'question_access_mode',
    iqi.question_access_mode,
    'instructor_question_number',
    admin_assessment_question_number (aq.id)
  ) AS instance_question_info,
  to_jsonb(aq) AS assessment_question,
  to_jsonb(q) AS question,
  to_jsonb(a) AS assessment,
  to_jsonb(aset) AS assessment_set,
  to_jsonb(aai) AS authz_result,
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
  LEFT JOIN teams AS g ON (
    g.id = ai.team_id
    AND g.deleted_at IS NULL
  )
  LEFT JOIN users AS u ON (u.id = ai.user_id)
  JOIN LATERAL authz_assessment_instance (
    ai.id,
    $authz_data,
    $req_date,
    ci.display_timezone,
    a.team_work
  ) AS aai ON TRUE
  CROSS JOIN file_list AS fl
WHERE
  iq.id = $instance_question_id
  AND ci.id = $course_instance_id
  AND (
    $assessment_id::bigint IS NULL
    OR a.id = $assessment_id
  )
  AND q.deleted_at IS NULL
  AND a.deleted_at IS NULL
  AND iqi.question_access_mode NOT IN ('blocked_sequence', 'blocked_lockpoint');
