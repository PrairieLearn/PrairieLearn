-- This migration needs to be run again after deployment is complete

UPDATE assessment_questions AS aq
SET
    max_manual_points = CASE WHEN q.grading_method = 'Manual' THEN aq.max_points ELSE 0 END,
    max_auto_points = CASE WHEN q.grading_method = 'Manual' THEN 0 ELSE aq.max_points END
FROM
    questions AS q
WHERE
    aq.max_manual_points IS NULL
    AND q.id = aq.question_id;
