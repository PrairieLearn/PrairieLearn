-- BLOCK select_instance_questions_manual_grading
WITH
  issue_count AS (
    SELECT
      i.instance_question_id AS instance_question_id,
      count(*)::integer AS open_issue_count
    FROM
      issues AS i
    WHERE
      i.assessment_id = $assessment_id
      AND i.course_caused
      AND i.open
    GROUP BY
      i.instance_question_id
  )
SELECT
  iq.*,
  -- Convert modified_at to a text representation suitable for
  -- PostgreSQL so it can be properly interpreted when a grade
  -- update POST is received back.
  CAST(iq.modified_at AS TEXT) AS modified_at,
  ai.open AS assessment_open,
  COALESCE(u.uid, array_to_string(gul.uid_list, ', ')) AS uid,
  COALESCE(agu.name, agu.uid) AS assigned_grader_name,
  COALESCE(lgu.name, lgu.uid) AS last_grader_name,
  to_jsonb(aq.*) AS assessment_question,
  COALESCE(g.name, u.name) AS user_or_group_name,
  ic.open_issue_count,
  -- Pseudo-random deterministic stable order of instance questions. This will
  -- always return the same set of instance questions in the same order, but it
  -- is designed to reduce the impact of the order of the instance questions on
  -- individual students, which reduces bias. See
  -- https://papers.ssrn.com/sol3/papers.cfm?abstract_id=4603146
  ((iq.id % 21317) * 45989) % 3767 as iq_stable_order
FROM
  instance_questions AS iq
  JOIN assessment_instances AS ai ON (ai.id = iq.assessment_instance_id)
  JOIN assessment_questions AS aq ON (aq.id = iq.assessment_question_id)
  LEFT JOIN users AS u ON (u.user_id = ai.user_id)
  LEFT JOIN groups AS g ON (g.id = ai.group_id)
  LEFT JOIN groups_uid_list (g.id) AS gul ON TRUE
  LEFT JOIN users AS agu ON (agu.user_id = iq.assigned_grader)
  LEFT JOIN users AS lgu ON (lgu.user_id = iq.last_grader)
  LEFT JOIN issue_count AS ic ON (ic.instance_question_id = iq.id)
WHERE
  ai.assessment_id = $assessment_id
  AND iq.assessment_question_id = $assessment_question_id
  AND iq.status != 'unanswered'
ORDER BY
  iq_stable_order,
  iq.id;

-- BLOCK update_instance_questions
UPDATE instance_questions AS iq
SET
  requires_manual_grading = CASE
    WHEN $update_requires_manual_grading THEN $requires_manual_grading
    ELSE requires_manual_grading
  END,
  assigned_grader = CASE
    WHEN $update_assigned_grader THEN $assigned_grader
    ELSE assigned_grader
  END
WHERE
  iq.assessment_question_id = $assessment_question_id
  AND iq.id = ANY ($instance_question_ids::BIGINT[]);

-- BLOCK toggle_ai_grading_mode
UPDATE assessment_questions
SET
  ai_grading_mode = NOT ai_grading_mode
WHERE
  id = $assessment_question_id;

-- BLOCK delete_ai_grading_jobs
WITH
  deleted_grading_jobs AS (
    UPDATE grading_jobs AS gj
    SET
      deleted_at = NOW(),
      deleted_by = $authn_user_id
    FROM
      submissions AS s
      JOIN variants AS v ON (v.id = s.variant_id)
      JOIN instance_questions AS iq ON (iq.id = v.instance_question_id)
    WHERE
      gj.submission_id = s.id
      AND gj.grading_method = 'AI'
      AND iq.assessment_question_id = $assessment_question_id
    RETURNING
      gj.id AS grading_job_id,
      iq.id AS instance_question_id
  )
SELECT DISTINCT
  instance_question_id,
  iq.max_points,
  iq.max_manual_points,
  iq.max_auto_points,
  points,
  score_perc,
  auto_points,
  manual_points (
    SELECT
      to_jsonb(gj.*)
    FROM
      grading_jobs AS gj
      JOIN submissions AS s ON (s.id = gj.submission_id)
      JOIN variants AS v ON (v.id = s.variant_id)
      JOIN instance_questions AS iq ON (iq.id = v.instance_question_id)
    WHERE
      iq.id = instance_question_id
      AND gj.grading_method = 'Manual'
    ORDER BY
      gj.date DESC,
      gj.id DESC
    LIMIT
      1
  ) AS last_manual_grading_job
FROM
  deleted_grading_jobs
  JOIN instance_questions AS iq ON (iq.id = deleted_grading_jobs.instance_question_id);

-- BLOCK update_instance_question_score
-- TODO: this whole thing needs to handle the case where there was not in fact
-- a previous manual grading job.
-- TODO: we need to update `manual_rubric_grading_id` on the submission.
WITH
  updated_instance_questions AS (
    UPDATE instance_questions AS iq
    SET
      points = $points,
      score_perc = $score_perc,
      manual_points = $manual_points,
      modified_at = NOW(),
      -- TODO: this probably needs to track the user from the previous grading job?
      last_grader = $authn_user_id
      -- TODO: this may need to compute `highest_submission_score`.
      -- TODO: this should probably update `is_ai_graded` to FALSE.
    WHERE
      iq.id = ANY ($instance_question_ids::BIGINT[])
    RETURNING
      iq.max_points,
      iq.max_manual_points,
      iq.max_auto_points,
      iq.points,
      iq.score_perc,
      iq.auto_points,
      iq.auto_points
  )
INSERT INTO
  question_score_logs (
    instance_question_id,
    auth_user_id,
    max_points,
    max_manual_points,
    max_auto_points,
    points,
    score_perc,
    auto_points,
    manual_points
  )
SELECT
  uiq.id,
  $authn_user_id,
  max_points,
  max_manual_points,
  max_auto_points,
  points,
  score_perc,
  auto_points,
  manual_points
FROM
  updated_instance_questions AS uiq;
