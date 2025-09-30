-- BLOCK select_next_instance_question_group_id
SELECT
  iqg.id AS instance_question_group_id
FROM
  instance_question_groups AS iqg
WHERE
  iqg.assessment_question_id = $assessment_question_id
  AND iqg.id > $prior_instance_question_group_id
ORDER BY
  iqg.id
LIMIT
  1;

-- BLOCK instance_question_group_id_for_instance_question
SELECT
  COALESCE(
    manual_instance_question_group_id,
    ai_instance_question_group_id
  )
FROM
  instance_questions AS iq
WHERE
  id = $instance_question_id;

-- BLOCK select_next_instance_question
WITH
  instance_questions_to_grade AS (
    SELECT
      iq.id,
      iq.assigned_grader,
      ((iq.id % 21317) * 45989) % 3767 AS iq_stable_order,
      (($prior_instance_question_id % 21317) * 45989) % 3767 AS prior_iq_stable_order
    FROM
      instance_questions AS iq
      JOIN assessment_instances AS ai ON (ai.id = iq.assessment_instance_id)
    WHERE
      iq.assessment_question_id = $assessment_question_id
      AND ai.assessment_id = $assessment_id -- since assessment_question_id is not authz'ed
      AND (
        -- When using instance question groups:
        -- If the previous instance question belongs to an instance question group, the next instance question must be in the same group.
        -- If the previous instance question has no group, the next must not be in a group as well.
        -- Otherwise, this filter has no effect.
        NOT $use_instance_question_groups
        OR (
          COALESCE(
            iq.manual_instance_question_group_id,
            iq.ai_instance_question_group_id
          ) = $prior_instance_question_group_id
          OR (
            COALESCE(
              iq.manual_instance_question_group_id,
              iq.ai_instance_question_group_id
            ) IS NULL
            AND $prior_instance_question_group_id IS NULL
          )
        )
      )
      AND (
        $prior_instance_question_id::bigint IS NULL
        OR iq.id != $prior_instance_question_id
      )
      AND (
        -- If skip graded submissions is selected, the next submission must require manual grading.
        -- Otherwise, the next submission doesn't have to.
        NOT ($skip_graded_submissions)
        OR iq.requires_manual_grading
      )
      AND (
        iq.assigned_grader = $user_id
        OR iq.assigned_grader IS NULL
      )
      AND EXISTS (
        SELECT
          1
        FROM
          variants AS v
          JOIN submissions AS s ON (s.variant_id = v.id)
        WHERE
          v.instance_question_id = iq.id
      )
  )
SELECT
  id
FROM
  instance_questions_to_grade
WHERE
  (
    -- If skipping graded submissions, the next submission does not necessarily need a higher stable order,
    -- since the next ungraded submission might have a lower stable order.
    -- Otherwise, the next submission must have a higher stable order. This prevents users from being redirected
    -- to the same submission twice.
    $skip_graded_submissions
    OR prior_iq_stable_order IS NULL
    OR iq_stable_order > prior_iq_stable_order
  )
ORDER BY
  -- Choose one assigned to current user if one exists, unassigned if not
  assigned_grader ASC NULLS LAST,
  -- Choose question that list after the prior if one exists. Follow the same
  -- default pseudo-random deterministic stable order used in the instance
  -- questions page.
  iq_stable_order > prior_iq_stable_order DESC,
  iq_stable_order ASC,
  id ASC
LIMIT
  1;

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

-- BLOCK select_rubric_grading_data
WITH
  rubric_items_data AS (
    SELECT
      JSONB_OBJECT_AGG(rgi.rubric_item_id, rgi) AS rubric_items
    FROM
      rubric_grading_items AS rgi
    WHERE
      rgi.rubric_grading_id = $rubric_grading_id
  )
SELECT
  rg.*,
  rid.rubric_items
FROM
  rubric_gradings rg
  LEFT JOIN rubric_items_data rid ON (TRUE)
WHERE
  rg.id = $rubric_grading_id;

-- BLOCK select_rubric_items
WITH
  rubric_items_data AS (
    SELECT
      JSONB_AGG(ri) AS items
    FROM
      rubric_items AS ri
    WHERE
      ri.rubric_id = $rubric_id
      AND ri.id = ANY ($rubric_items::bigint[])
      AND ri.deleted_at IS NULL
  )
SELECT
  TO_JSONB(r) AS rubric_data,
  COALESCE(rid.items, '[]'::jsonb) AS rubric_item_data
FROM
  rubrics r
  LEFT JOIN rubric_items_data rid ON (TRUE)
WHERE
  r.id = $rubric_id
  AND r.deleted_at IS NULL;

-- BLOCK select_assessment_question_for_update
SELECT
  *
FROM
  assessment_questions
WHERE
  id = $assessment_question_id
FOR NO KEY UPDATE;

-- BLOCK insert_rubric
INSERT INTO
  rubrics (
    starting_points,
    min_points,
    max_extra_points,
    replace_auto_points
  )
VALUES
  (
    $starting_points,
    $min_points,
    $max_extra_points,
    $replace_auto_points
  )
RETURNING
  id;

-- BLOCK update_rubric
UPDATE rubrics
SET
  starting_points = $starting_points,
  min_points = $min_points,
  max_extra_points = $max_extra_points,
  replace_auto_points = $replace_auto_points,
  modified_at = CURRENT_TIMESTAMP
WHERE
  id = $rubric_id;

-- BLOCK update_assessment_question_rubric_id
UPDATE assessment_questions
SET
  manual_rubric_id = $manual_rubric_id
WHERE
  id = $assessment_question_id;

-- BLOCK delete_rubric_items
UPDATE rubric_items
SET
  deleted_at = NOW()
WHERE
  rubric_id = $rubric_id
  AND deleted_at IS NULL
  AND NOT (id = ANY ($active_rubric_items::bigint[]));

-- BLOCK update_rubric_item
UPDATE rubric_items
SET
  number = $number::bigint,
  points = $points,
  description = COALESCE($description, description),
  explanation = COALESCE($explanation, explanation),
  grader_note = COALESCE($grader_note, grader_note),
  key_binding = CASE
    WHEN $number >= 10 THEN NULL
    ELSE MOD($number + 1, 10)
  END,
  always_show_to_students = COALESCE($always_show_to_students, always_show_to_students),
  deleted_at = NULL
WHERE
  id = $id
  AND rubric_id = $rubric_id
RETURNING
  id;

-- BLOCK insert_rubric_item
INSERT INTO
  rubric_items (
    rubric_id,
    number,
    points,
    description,
    explanation,
    grader_note,
    key_binding,
    always_show_to_students
  )
VALUES
  (
    $rubric_id,
    $number::bigint,
    $points,
    $description,
    $explanation,
    $grader_note,
    CASE
      WHEN $number >= 10 THEN NULL
      ELSE MOD($number + 1, 10)
    END,
    $always_show_to_students
  );

-- BLOCK select_instance_questions_to_update
WITH
  rubric_gradings_to_review AS (
    SELECT DISTINCT
      ON (iq.id) -- Select only the latest submission for each instance question
      rg.*,
      aq.assessment_id,
      iq.assessment_instance_id,
      iq.id AS instance_question_id,
      s.id AS submission_id,
      rg.starting_points != r.starting_points
      OR rg.max_extra_points != r.max_extra_points
      OR rg.min_points != r.min_points AS rubric_settings_changed
    FROM
      instance_questions AS iq
      JOIN assessment_questions AS aq ON (aq.id = iq.assessment_question_id)
      JOIN variants AS v ON (v.instance_question_id = iq.id)
      JOIN submissions AS s ON (s.variant_id = v.id)
      JOIN rubric_gradings AS rg ON (rg.id = s.manual_rubric_grading_id)
      JOIN rubrics AS r ON (r.id = rg.rubric_id)
    WHERE
      iq.assessment_question_id = $assessment_question_id
    ORDER BY
      iq.id ASC,
      s.date DESC,
      s.id DESC
  ),
  grading_items_to_review AS (
    SELECT
      rgr.id AS rubric_grading_id,
      JSONB_AGG(rgi) AS applied_rubric_items,
      BOOL_OR(
        ri.id IS NULL
        OR ri.points != rgi.points
      ) AS rubric_items_changed
    FROM
      rubric_gradings_to_review AS rgr
      JOIN rubric_grading_items AS rgi ON (rgi.rubric_grading_id = rgr.id)
      LEFT JOIN rubric_items AS ri ON (
        ri.id = rgi.rubric_item_id
        AND ri.deleted_at IS NULL
      )
    GROUP BY
      rgr.id
  )
SELECT
  rgr.*,
  gir.applied_rubric_items,
  COALESCE(gir.rubric_items_changed, FALSE) AS rubric_items_changed,
  iq.is_ai_graded
FROM
  rubric_gradings_to_review AS rgr
  JOIN instance_questions AS iq ON (iq.id = rgr.instance_question_id)
  LEFT JOIN grading_items_to_review AS gir ON (gir.rubric_grading_id = rgr.id)
WHERE
  rgr.rubric_settings_changed IS TRUE
  OR gir.rubric_items_changed IS TRUE
FOR NO KEY UPDATE OF
  iq;

-- BLOCK tag_for_manual_grading
UPDATE instance_questions iq
SET
  requires_manual_grading = TRUE
WHERE
  iq.assessment_question_id = $assessment_question_id;

-- BLOCK insert_rubric_grading
WITH
  inserted_rubric_grading AS (
    INSERT INTO
      rubric_gradings (
        rubric_id,
        computed_points,
        adjust_points,
        starting_points,
        max_extra_points,
        min_points
      )
    SELECT
      r.id,
      $computed_points,
      $adjust_points,
      r.starting_points,
      r.max_extra_points,
      r.min_points
    FROM
      rubrics r
    WHERE
      r.id = $rubric_id
    RETURNING
      *
  ),
  inserted_rubric_grading_items AS (
    INSERT INTO
      rubric_grading_items (
        rubric_grading_id,
        rubric_item_id,
        score,
        points,
        description
      )
    SELECT
      irg.id,
      ari.rubric_item_id,
      COALESCE(ari.score, 1),
      ri.points,
      ri.description
    FROM
      inserted_rubric_grading AS irg
      JOIN JSONB_TO_RECORDSET($rubric_items::jsonb) AS ari (rubric_item_id bigint, score double precision) ON (TRUE)
      JOIN rubric_items AS ri ON (
        ri.id = ari.rubric_item_id
        AND ri.rubric_id = $rubric_id
      )
    RETURNING
      *
  )
SELECT
  irg.id
FROM
  inserted_rubric_grading AS irg
  LEFT JOIN inserted_rubric_grading_items ON (TRUE)
LIMIT
  1;

-- BLOCK select_submission_for_score_update
SELECT
  s.id AS submission_id,
  iq.id AS instance_question_id,
  ai.id AS assessment_instance_id,
  aq.max_points,
  aq.max_auto_points,
  aq.max_manual_points,
  aq.manual_rubric_id,
  s.partial_scores,
  iq.auto_points,
  iq.manual_points,
  s.manual_rubric_grading_id,
  $check_modified_at::timestamptz IS NOT NULL
  -- We are comparing a database timestamp (microseconds precision) to a time
  -- that comes from the client (milliseconds precision). This avoids a precision
  -- mismatch that would cause the comparison to fail.
  AND date_trunc('milliseconds', $check_modified_at) != date_trunc('milliseconds', iq.modified_at) AS modified_at_conflict
FROM
  instance_questions AS iq
  JOIN assessment_questions AS aq ON (aq.id = iq.assessment_question_id)
  JOIN questions AS q ON (q.id = aq.question_id)
  JOIN assessment_instances AS ai ON (ai.id = iq.assessment_instance_id)
  JOIN assessments AS a ON (a.id = ai.assessment_id)
  LEFT JOIN variants AS v ON (v.instance_question_id = iq.id)
  LEFT JOIN submissions AS s ON (s.variant_id = v.id)
WHERE
  a.id = $assessment_id
  AND iq.id = $instance_question_id
  AND (
    s.id = $submission_id
    OR $submission_id IS NULL
  )
ORDER BY
  -- If there variants with and without submissions, select one that has a submission. If there are
  -- no submissions at all, the process proceeds, but without submission and grading job changes.
  s.date DESC NULLS LAST,
  s.id DESC NULLS LAST
LIMIT
  1
FOR NO KEY UPDATE OF
  iq;

-- BLOCK insert_grading_job
INSERT INTO
  grading_jobs (
    submission_id,
    auth_user_id,
    graded_by,
    graded_at,
    grading_method,
    correct,
    score,
    auto_points,
    manual_points,
    feedback,
    partial_scores,
    manual_rubric_grading_id
  )
VALUES
  (
    $submission_id,
    $authn_user_id,
    $authn_user_id,
    now(),
    $grading_method,
    $correct,
    $score,
    $auto_points,
    $manual_points,
    $feedback,
    $partial_scores,
    $manual_rubric_grading_id
  )
RETURNING
  id;

-- BLOCK update_submission_score
UPDATE submissions AS s
SET
  feedback = CASE
    WHEN feedback IS NULL THEN $feedback::jsonb
    WHEN $feedback::jsonb IS NULL THEN feedback
    WHEN jsonb_typeof(feedback) = 'object'
    AND jsonb_typeof($feedback::jsonb) = 'object' THEN feedback || $feedback::jsonb
    ELSE $feedback::jsonb
  END,
  partial_scores = COALESCE($partial_scores::jsonb, partial_scores),
  manual_rubric_grading_id = $manual_rubric_grading_id,
  graded_at = now(),
  modified_at = now(),
  override_score = COALESCE($score, override_score),
  score = COALESCE($score, score),
  correct = COALESCE($correct, correct),
  gradable = CASE
    WHEN $score IS NULL THEN gradable
    ELSE TRUE
  END,
  is_ai_graded = $is_ai_graded
WHERE
  s.id = $submission_id;

-- BLOCK update_instance_question_score
WITH
  updated_instance_question AS (
    UPDATE instance_questions AS iq
    SET
      points = $points,
      score_perc = $score_perc,
      auto_points = COALESCE($auto_points, auto_points),
      manual_points = COALESCE($manual_points, manual_points),
      status = 'complete',
      modified_at = now(),
      -- TODO: this might not be correct. Matt suggested that we might want to
      -- refactor `highest_submission_score` to track only auto points.
      highest_submission_score = COALESCE($score, highest_submission_score),
      requires_manual_grading = FALSE,
      last_grader = $authn_user_id,
      is_ai_graded = $is_ai_graded
    WHERE
      iq.id = $instance_question_id
    RETURNING
      id
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
  $max_points,
  $max_manual_points,
  $max_auto_points,
  $points,
  $score_perc,
  $auto_points,
  $manual_points
FROM
  updated_instance_question uiq
RETURNING
  *;
