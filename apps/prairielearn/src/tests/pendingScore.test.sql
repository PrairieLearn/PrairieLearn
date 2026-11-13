-- BLOCK set_manual_question_states
WITH
  states AS (
    SELECT
      *
    FROM
      jsonb_to_recordset($states::jsonb) AS x (
        qid text,
        points double precision,
        max_points double precision
      )
  ),
  updated_questions AS (
    UPDATE assessment_questions AS aq
    SET
      max_points = s.max_points,
      max_manual_points = s.max_points,
      max_auto_points = 0
    FROM
      questions AS q,
      states AS s,
      assessment_instances AS ai
    WHERE
      q.id = aq.question_id
      AND q.qid = s.qid
      AND aq.assessment_id = ai.assessment_id
      AND ai.id = $assessment_instance_id
    RETURNING
      aq.id,
      s.points
  )
UPDATE instance_questions AS iq
SET
  points = q.points,
  manual_points = q.points,
  auto_points = 0,
  status = 'complete',
  requires_manual_grading = TRUE
FROM
  updated_questions AS q
WHERE
  iq.assessment_question_id = q.id
  AND iq.assessment_instance_id = $assessment_instance_id;

-- BLOCK select_question_grade_state
SELECT
  id,
  used_for_grade
FROM
  instance_questions
WHERE
  assessment_instance_id = $assessment_instance_id
ORDER BY
  id;

-- BLOCK reset_pending_score
UPDATE assessment_instances
SET
  grading_pending = FALSE,
  score_perc_pending = 0
WHERE
  id = $assessment_instance_id;

-- BLOCK count_score_logs
SELECT
  count(*)::integer
FROM
  assessment_score_logs
WHERE
  assessment_instance_id = $assessment_instance_id;

-- BLOCK insert_pending_auto_submissions
WITH
  selected_questions AS (
    SELECT
      iq.id,
      q.id AS question_id,
      q.course_id,
      ai.user_id,
      a.course_instance_id
    FROM
      instance_questions AS iq
      JOIN assessment_instances AS ai ON ai.id = iq.assessment_instance_id
      JOIN assessments AS a ON a.id = ai.assessment_id
      JOIN assessment_questions AS aq ON aq.id = iq.assessment_question_id
      JOIN questions AS q ON q.id = aq.question_id
    WHERE
      ai.id = $assessment_instance_id
      AND $credits::jsonb ? q.qid
  ),
  updated AS (
    UPDATE instance_questions AS iq
    SET
      status = 'saved'
    FROM
      selected_questions AS q
    WHERE
      iq.id = q.id
  ),
  new_variants AS (
    INSERT INTO
      variants (
        instance_question_id,
        question_id,
        course_id,
        course_instance_id,
        authn_user_id,
        user_id,
        variant_seed
      )
    SELECT
      id,
      question_id,
      course_id,
      course_instance_id,
      user_id,
      user_id,
      'pending-score'
    FROM
      selected_questions
    RETURNING
      *
  )
INSERT INTO
  submissions (variant_id, credit, date)
SELECT
  v.id,
  ($credits::jsonb ->> q.qid)::integer,
  CASE
    WHEN q.qid = 'internalGrade/addingNumbers' THEN now() - interval '1 minute'
    ELSE now()
  END
FROM
  new_variants AS v
  JOIN questions AS q ON q.id = v.question_id;

-- BLOCK select_question_ids
SELECT
  iq.id,
  aq.id AS assessment_question_id,
  q.qid
FROM
  instance_questions AS iq
  JOIN assessment_questions AS aq ON aq.id = iq.assessment_question_id
  JOIN questions AS q ON q.id = aq.question_id
WHERE
  iq.assessment_instance_id = $assessment_instance_id;

-- BLOCK set_automatic_question_score
UPDATE instance_questions
SET
  points = 2,
  auto_points = 2,
  manual_points = 0,
  status = 'incorrect'
WHERE
  id = $instance_question_id;

-- BLOCK select_pending_submission
SELECT
  iq.id AS instance_question_id,
  s.id AS submission_id
FROM
  instance_questions AS iq
  JOIN variants AS v ON v.instance_question_id = iq.id
  JOIN submissions AS s ON s.variant_id = v.id
WHERE
  iq.assessment_instance_id = $assessment_instance_id
ORDER BY
  s.date DESC,
  s.id DESC
LIMIT
  1;

-- BLOCK add_manual_points
WITH
  updated AS (
    UPDATE assessment_questions
    SET
      max_manual_points = 2,
      max_points = 8,
      init_points = 4
    WHERE
      id = (
        SELECT
          assessment_question_id
        FROM
          instance_questions
        WHERE
          id = $instance_question_id
      )
  )
UPDATE instance_questions
SET
  current_value = 4,
  requires_manual_grading = TRUE
WHERE
  id = $instance_question_id;

-- BLOCK close_instance
UPDATE assessment_instances
SET
  open = FALSE
WHERE
  id = $assessment_instance_id;

-- BLOCK hide_question
UPDATE assessment_questions
SET
  deleted_at = now()
WHERE
  id = $assessment_question_id;

-- BLOCK select_rubric_item
SELECT
  r.id AS rubric_id,
  ri.id AS rubric_item_id
FROM
  assessment_questions AS aq
  JOIN rubrics AS r ON r.id = aq.manual_rubric_id
  JOIN rubric_items AS ri ON ri.rubric_id = r.id
WHERE
  aq.id = $assessment_question_id;
