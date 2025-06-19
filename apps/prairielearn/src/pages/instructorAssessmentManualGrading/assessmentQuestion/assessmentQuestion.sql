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
      AND gj.deleted_at IS NULL
      AND iq.assessment_question_id = $assessment_question_id
    RETURNING
      gj.id AS grading_job_id,
      gj.submission_id,
      iq.id AS instance_question_id,
      iq.assessment_question_id
  ),
  previous_manual_grading_jobs AS (
    SELECT DISTINCT
      ON (iq.id) iq.id AS instance_question_id,
      gj.*
    FROM
      deleted_grading_jobs AS dgj
      JOIN instance_questions AS iq ON (iq.id = dgj.instance_question_id)
      JOIN variants AS v ON (v.instance_question_id = iq.id)
      JOIN submissions AS s ON (s.variant_id = v.id)
      JOIN grading_jobs AS gj ON (gj.submission_id = s.id)
    WHERE
      gj.grading_method = 'Manual'
    ORDER BY
      iq.id,
      gj.date DESC,
      gj.id DESC
  ),
  previous_automatic_grading_jobs AS (
    SELECT DISTINCT
      ON (iq.id) iq.id AS instance_question_id,
      gj.*
    FROM
      deleted_grading_jobs AS dgj
      JOIN instance_questions AS iq ON (iq.id = dgj.instance_question_id)
      JOIN variants AS v ON (v.instance_question_id = iq.id)
      JOIN submissions AS s ON (s.variant_id = v.id)
      JOIN grading_jobs AS gj ON (gj.submission_id = s.id)
    WHERE
      gj.grading_method NOT IN ('Manual', 'AI')
    ORDER BY
      iq.id,
      gj.date DESC,
      gj.id DESC
  ),
  latest_submissions AS (
    SELECT DISTINCT
      ON (dgj.instance_question_id) dgj.instance_question_id AS instance_question_id,
      s.id AS submission_id
    FROM
      deleted_grading_jobs AS dgj
      JOIN variants AS v ON (v.instance_question_id = dgj.instance_question_id)
      JOIN submissions AS s ON (s.variant_id = v.id)
    ORDER BY
      dgj.instance_question_id,
      s.date DESC,
      s.id DESC
  ),
  updated_submissions AS (
    UPDATE submissions AS s
    SET
      is_ai_graded = FALSE,
      manual_rubric_grading_id = pmgj.manual_rubric_grading_id,
      -- TODO: this is incorrect.
      -- - If real-time grading is disabled, someone could manually grade a
      --   submission while it's in a saved state, and then the question could
      --   be automatically graded later.
      -- - This doesn't handle multiple submissions well. We need to deal with
      --   each submission's grading jobs separately, but currently we're using
      --   the latest grading jobs for the instance question as a whole.
      feedback = COALESCE(pmgj.feedback, pagj.feedback)
    FROM
      deleted_grading_jobs AS dgj
      LEFT JOIN previous_manual_grading_jobs AS pmgj ON (
        pmgj.instance_question_id = dgj.instance_question_id
      )
      LEFT JOIN previous_automatic_grading_jobs AS pagj ON (
        pagj.instance_question_id = dgj.instance_question_id
      )
    WHERE
      s.id = dgj.submission_id
  ),
  -- TODO: this whole thing needs to handle the case where there was not in fact
  -- a previous manual grading job.
  -- TODO: does this need locking, either on the instance questions or the submissions?
  -- TODO: should we try to revert `status`? It gets set to `complete` when manual grading
  -- occurs, but I'm not sure if we can safely revert it to another value, e.g. `saved`.
  updated_instance_questions AS (
    UPDATE instance_questions AS iq
    SET
      points = (
        COALESCE(iq.auto_points, 0) + COALESCE(pmgj.manual_points, 0)
      ),
      score_perc = (
        COALESCE(iq.auto_points, 0) + COALESCE(pmgj.manual_points, 0)
      ) / aq.max_points * 100,
      -- TODO: should this be set to 0 if there is no previous manual grading job? Or is NULL ok?
      manual_points = pmgj.manual_points,
      modified_at = NOW(),
      last_grader = pmgj.auth_user_id,
      -- TODO: this may need to compute `highest_submission_score`.
      is_ai_graded = FALSE,
      -- If there is no previous manual grading job, we'll flag that the instance question
      -- requires manual grading. This both helps ensure that it eventually gets graded, and
      -- also ensures that this submission isn't erroneously picked up when we're looking for
      -- similar submissions for RAG.
      requires_manual_grading = (
        CASE
          WHEN pmgj.id IS NULL THEN TRUE
          ELSE FALSE
        END
      )
    FROM
      deleted_grading_jobs AS dgj
      JOIN assessment_questions AS aq ON (aq.id = dgj.assessment_question_id)
      LEFT JOIN previous_manual_grading_jobs AS pmgj ON (
        pmgj.instance_question_id = dgj.instance_question_id
      )
    WHERE
      iq.id = dgj.instance_question_id
    RETURNING
      iq.id,
      iq.assessment_instance_id,
      iq.points,
      iq.score_perc,
      iq.auto_points,
      iq.manual_points,
      aq.max_points,
      aq.max_auto_points,
      aq.max_manual_points
  ),
  logs AS (
    INSERT INTO
      question_score_logs (
        instance_question_id,
        auth_user_id,
        max_points,
        max_auto_points,
        max_manual_points,
        points,
        score_perc,
        auto_points,
        manual_points
      )
    SELECT
      uiq.id,
      -- TODO: is this the correct user ID? Should this be the user who submitted the
      -- previous manual grading job? What if there was no previous manual grading job,
      -- just null it out?
      $authn_user_id,
      uiq.max_points,
      uiq.max_auto_points,
      uiq.max_manual_points,
      uiq.points,
      uiq.score_perc,
      uiq.auto_points,
      uiq.manual_points
    FROM
      updated_instance_questions AS uiq
  )
SELECT
  uiq.*,
  to_jsonb(pmgj.*) AS last_manual_grading_job
FROM
  updated_instance_questions AS uiq
  LEFT JOIN previous_manual_grading_jobs AS pmgj ON (pmgj.instance_question_id = uiq.id);
