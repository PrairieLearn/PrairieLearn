-- This migration needs to be run again after deployment is complete
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
  aq.max_manual_points IS NULL
  AND q.id = aq.question_id;

UPDATE instance_questions AS iq
SET
  -- This computation, in practice, assigns manual_points if the
  -- question is manually graded or if the points are above
  -- max_auto_points.
  auto_points = COALESCE(
    iq.auto_points,
    LEAST(iq.points, aq.max_auto_points)
  ),
  manual_points = COALESCE(
    iq.manual_points,
    GREATEST(0, iq.points - aq.max_auto_points)
  )
FROM
  assessment_questions AS aq
WHERE
  (
    iq.auto_points IS NULL
    OR iq.manual_points IS NULL
  )
  AND aq.id = iq.assessment_question_id;
