-- BLOCK recompute_question_points_split
-- When a question's grading method flips to/from Manual, the total points its
-- assessment question is worth (`max_points`) are unchanged — only the split
-- between manual and auto points moves. Split-points assessment questions
-- (those whose assessment JSON set auto/manual points explicitly) are
-- unaffected by the question's grading method, so we leave them alone. An
-- assessment question has split points when any of `autoPoints`, `maxAutoPoints`
-- or `manualPoints` was set in the JSON; we detect "not split" by the
-- corresponding stored columns all being absent. Note `json_auto_points` is a
-- jsonb column, so an unset value is the JSON `null`, not SQL NULL.
UPDATE assessment_questions AS aq
SET
  max_manual_points = CASE
    WHEN q.grading_method = 'Manual' THEN aq.max_points
    ELSE 0
  END,
  max_auto_points = CASE
    WHEN q.grading_method = 'Manual' THEN 0
    ELSE aq.max_points
  END
FROM
  questions AS q
WHERE
  aq.question_id = q.id
  AND aq.assessment_id = $assessment_id
  AND aq.question_id = $question_id
  AND aq.deleted_at IS NULL
  AND aq.json_max_auto_points IS NULL
  AND aq.json_manual_points IS NULL
  AND (
    aq.json_auto_points IS NULL
    OR JSONB_TYPEOF(aq.json_auto_points) = 'null'
  );
