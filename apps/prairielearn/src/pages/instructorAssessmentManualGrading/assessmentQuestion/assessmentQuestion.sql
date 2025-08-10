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
  most_recent_submission_manual_grading_jobs AS (
    SELECT DISTINCT
      ON (s.id) s.id AS submission_id,
      gj.manual_rubric_grading_id AS manual_rubric_grading_id
    FROM
      deleted_grading_jobs AS dgj
      JOIN variants AS v ON (v.instance_question_id = dgj.instance_question_id)
      JOIN submissions AS s ON (s.variant_id = v.id)
      JOIN grading_jobs AS gj ON (gj.submission_id = s.id)
    WHERE
      gj.grading_method = 'Manual'
    ORDER BY
      s.id,
      gj.date DESC,
      gj.id DESC
  ),
  most_recent_submission_non_ai_grading_jobs AS (
    SELECT DISTINCT
      ON (s.id) s.id AS submission_id,
      gj.feedback
    FROM
      deleted_grading_jobs AS dgj
      JOIN variants AS v ON (v.instance_question_id = dgj.instance_question_id)
      JOIN submissions AS s ON (s.variant_id = v.id)
      JOIN grading_jobs AS gj ON (gj.submission_id = s.id)
    WHERE
      gj.grading_method != 'AI'
    ORDER BY
      s.id,
      gj.date DESC,
      gj.id DESC
  ),
  updated_submissions AS (
    UPDATE submissions AS s
    SET
      is_ai_graded = FALSE,
      -- For each submission, we'll pull the rubric grading ID from the most
      -- recent manual grading job.
      manual_rubric_grading_id = mrsmgj.manual_rubric_grading_id,
      -- For each submission, we'll pull the feedback from the most recent
      -- non-AI grading job. If there wasn't one, this will be set to `NULL`,
      -- which is the implicit default value for something that has never been graded.
      feedback = mrsnagj.feedback
    FROM
      deleted_grading_jobs AS dgj
      LEFT JOIN most_recent_submission_manual_grading_jobs AS mrsmgj ON TRUE
      LEFT JOIN most_recent_submission_non_ai_grading_jobs AS mrsnagj ON TRUE
    WHERE
      s.id = dgj.submission_id
      AND mrsmgj.submission_id = s.id
      AND mrsnagj.submission_id = s.id
  ),
  most_recent_instance_question_manual_grading_jobs AS (
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
  -- TODO: this should likely be updating `status` somehow. It gets set to `complete` when
  -- manual grading occurs, but we may want to revert to `saved` (or maybe another status)
  -- depending on the situation.
  updated_instance_questions AS (
    UPDATE instance_questions AS iq
    SET
      points = (
        COALESCE(iq.auto_points, 0) + COALESCE(mriqmgj.manual_points, 0)
      ),
      score_perc = (
        COALESCE(iq.auto_points, 0) + COALESCE(mriqmgj.manual_points, 0)
      ) / aq.max_points * 100,
      -- If there was no previous manual grading job, this will be set to `NULL`, not 0.
      -- This is the expected behavior, as an instance question that has never been manually graded
      -- would already have `NULL` for `manual_points`.
      manual_points = mriqmgj.manual_points,
      modified_at = NOW(),
      last_grader = mriqmgj.auth_user_id,
      -- TODO: this may need to compute `highest_submission_score`. Or, as Matt suggested,
      -- we may want to refactor `highest_submission_score` to only track auto points.
      is_ai_graded = FALSE,
      -- If there is no previous manual grading job, we'll flag that the instance question
      -- requires manual grading. This both helps ensure that it eventually gets graded, and
      -- also ensures that this submission isn't erroneously picked up when we're looking for
      -- similar submissions for RAG.
      requires_manual_grading = (
        CASE
          WHEN mriqmgj.id IS NULL THEN TRUE
          ELSE FALSE
        END
      )
    FROM
      deleted_grading_jobs AS dgj
      JOIN assessment_questions AS aq ON (aq.id = dgj.assessment_question_id)
      LEFT JOIN most_recent_instance_question_manual_grading_jobs AS mriqmgj ON (
        mriqmgj.instance_question_id = dgj.instance_question_id
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
      -- We deliberately use the user that's performing the deletion, not the user who
      -- performed the previous manual grading job, because there might not be one.
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
  to_jsonb(mriqmgj.*) AS most_recent_manual_grading_job
FROM
  updated_instance_questions AS uiq
  LEFT JOIN most_recent_instance_question_manual_grading_jobs AS mriqmgj ON (mriqmgj.instance_question_id = uiq.id);

-- BLOCK select_rubric_data
WITH
  submission_count_per_rubric_item AS (
    SELECT
      rgi.rubric_item_id,
      COUNT(DISTINCT iq.id) AS num_submissions
    FROM
      instance_questions iq
      JOIN variants AS v ON (v.instance_question_id = iq.id)
      JOIN submissions AS s ON (s.variant_id = v.id)
      JOIN rubric_gradings rg ON (
        rg.id = s.manual_rubric_grading_id
        AND rg.rubric_id = $rubric_id
      )
      JOIN rubric_grading_items rgi ON (rgi.rubric_grading_id = rg.id)
    WHERE
      iq.assessment_question_id = $assessment_question_id
    GROUP BY
      rgi.rubric_item_id
  ),
  rubric_items_data AS (
    SELECT
      JSONB_AGG(
        TO_JSONB(ri) || JSONB_BUILD_OBJECT(
          'num_submissions',
          COALESCE(scpri.num_submissions, 0)
        )
        ORDER BY
          ri.number,
          ri.id
      ) AS items_data
    FROM
      rubric_items AS ri
      LEFT JOIN submission_count_per_rubric_item AS scpri ON (scpri.rubric_item_id = ri.id)
    WHERE
      ri.rubric_id = $rubric_id
      AND ri.deleted_at IS NULL
  )
SELECT
  r.*,
  rid.items_data AS rubric_items
FROM
  rubrics r
  LEFT JOIN rubric_items_data rid ON (TRUE)
WHERE
  r.id = $rubric_id
AND r.deleted_at IS NULL;
