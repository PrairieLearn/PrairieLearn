-- This migration needs to be run again after deployment is complete

UPDATE assessment_questions AS aq
SET
    manual_points = CASE WHEN q.grading_method = 'Manual' THEN max_points ELSE 0 END,
    max_auto_points = CASE WHEN q.grading_method = 'Manual' THEN 0 ELSE max_points END,
    init_points = CASE WHEN q.grading_method = 'Manual' THEN 0 ELSE init_points END,
    points_list = CASE WHEN q.grading_method = 'Manual' THEN NULL ELSE points_list END
FROM
    questions AS q
WHERE
    aq.manual_points IS NULL
    AND q.id = aq.question_id;
