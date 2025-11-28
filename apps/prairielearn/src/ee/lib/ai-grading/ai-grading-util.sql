-- BLOCK select_rubric_grading_items
SELECT
  ri.*
FROM
  rubric_grading_items AS rgi
  JOIN rubric_items AS ri ON rgi.rubric_item_id = ri.id
WHERE
  rgi.rubric_grading_id = $manual_rubric_grading_id;

-- BLOCK create_embedding_for_submission
INSERT INTO
  submission_grading_context_embeddings (
    embedding,
    submission_id,
    submission_text,
    assessment_question_id
  )
VALUES
  (
    $embedding,
    $submission_id,
    $submission_text,
    $assessment_question_id
  )
RETURNING
  *;

-- BLOCK select_instance_questions_for_assessment_question
SELECT
  iq.*
FROM
  instance_questions AS iq
  JOIN assessment_instances AS ai ON ai.id = iq.assessment_instance_id
WHERE
  iq.assessment_question_id = $assessment_question_id
  AND iq.status != 'unanswered'
  AND (
    NOT $closed_instance_questions_only
    OR ai.open = FALSE
  )
  AND (
    NOT $ungrouped_instance_questions_only
    OR (
      iq.ai_instance_question_group_id IS NULL
      AND iq.manual_instance_question_group_id IS NULL
    )
  );

-- BLOCK insert_ai_grading_job
INSERT INTO
  ai_grading_jobs (
    grading_job_id,
    job_sequence_id,
    prompt,
    completion,
    model,
    prompt_tokens,
    completion_tokens,
    cost,
    course_id,
    course_instance_id
  )
VALUES
  (
    $grading_job_id,
    $job_sequence_id,
    $prompt::jsonb,
    $completion,
    $model,
    $prompt_tokens,
    $completion_tokens,
    $cost,
    $course_id,
    $course_instance_id
  );

-- BLOCK select_last_variant_and_submission
SELECT
  to_jsonb(v.*) AS variant,
  to_jsonb(s.*) AS submission
FROM
  variants AS v
  JOIN submissions AS s ON (s.variant_id = v.id)
WHERE
  v.instance_question_id = $instance_question_id
ORDER BY
  v.date DESC,
  s.date DESC
LIMIT
  1;

-- BLOCK select_closest_submission_info
WITH
  latest_submissions AS (
    SELECT
      s.id AS s_id,
      iq.id AS iq_id,
      iq.score_perc AS iq_score_perc,
      s.feedback,
      s.is_ai_graded,
      s.manual_rubric_grading_id AS s_manual_rubric_grading_id,
      ROW_NUMBER() OVER (
        PARTITION BY
          s.variant_id
        ORDER BY
          s.date DESC
      ) AS rn
    FROM
      instance_questions iq
      JOIN variants v ON iq.id = v.instance_question_id
      JOIN submissions s ON v.id = s.variant_id
    WHERE
      iq.assessment_question_id = $assessment_question_id
      AND NOT iq.requires_manual_grading
      AND iq.status != 'unanswered'
      AND s.id != $submission_id
  )
SELECT
  emb.submission_text,
  ls.s_manual_rubric_grading_id AS manual_rubric_grading_id,
  ls.iq_score_perc AS score_perc,
  ls.feedback,
  ls.iq_id AS instance_question_id
FROM
  latest_submissions ls
  JOIN submission_grading_context_embeddings AS emb ON (emb.submission_id = ls.s_id)
WHERE
  ls.rn = 1
  AND NOT ls.is_ai_graded
ORDER BY
  embedding <=> $embedding
LIMIT
  $limit;

-- BLOCK select_rubric_for_grading
SELECT
  ri.*
FROM
  assessment_questions aq
  JOIN rubric_items ri ON aq.manual_rubric_id = ri.rubric_id
WHERE
  aq.id = $assessment_question_id
  AND ri.deleted_at IS NULL
ORDER BY
  ri.number;

-- BLOCK select_rubric_additional_context
SELECT
  r.ai_grading_additional_context
FROM
  rubrics AS r
  JOIN assessment_questions AS aq ON r.id = aq.manual_rubric_id
WHERE
  aq.id = $assessment_question_id;

-- BLOCK select_last_submission_id
SELECT
  s.id
FROM
  variants AS v
  JOIN submissions AS s ON (s.variant_id = v.id)
WHERE
  v.instance_question_id = $instance_question_id
ORDER BY
  v.date DESC,
  s.date DESC
LIMIT
  1;

-- BLOCK select_embedding_for_submission
SELECT
  *
FROM
  submission_grading_context_embeddings AS emb
WHERE
  emb.submission_id = $submission_id;

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
      AND iq.assessment_question_id IN (
        SELECT
          unnest($assessment_question_ids::int[])
      )
    RETURNING
      gj.id AS grading_job_id,
      gj.submission_id,
      iq.id AS instance_question_id,
      iq.assessment_question_id
  ),
  most_recent_submission_manual_grading_jobs AS (
    SELECT DISTINCT
      ON (s.id) s.id AS submission_id,
      gj.manual_rubric_grading_id
    FROM
      deleted_grading_jobs AS dgj
      JOIN variants AS v ON (v.instance_question_id = dgj.instance_question_id)
      JOIN submissions AS s ON (s.variant_id = v.id)
      JOIN grading_jobs AS gj ON (gj.submission_id = s.id)
    WHERE
      gj.grading_method = 'Manual'
    ORDER BY
      s.id ASC,
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
      s.id ASC,
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
      iq.id ASC,
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
      requires_manual_grading = (coalesce(mriqmgj.id IS NULL, FALSE))
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

-- BLOCK toggle_ai_grading_mode
UPDATE assessment_questions
SET
  ai_grading_mode = NOT ai_grading_mode
WHERE
  id = $assessment_question_id;

-- BLOCK set_ai_grading_mode
UPDATE assessment_questions
SET
  ai_grading_mode = $ai_grading_mode
WHERE
  id = $assessment_question_id;
