-- This migration needs to be run again after deployment is complete

UPDATE assessment_questions AS aq
SET
    manual_points = CASE WHEN q.grading_method = 'Manual' THEN aq.max_points ELSE 0 END,
    max_auto_points = CASE WHEN q.grading_method = 'Manual' THEN 0 ELSE aq.max_points END,
    init_points = CASE WHEN q.grading_method = 'Manual' THEN 0 ELSE aq.init_points END,
    points_list = CASE WHEN q.grading_method = 'Manual' AND a.type = 'Exam' THEN '{0}'::double precision[] ELSE aq.points_list END
FROM
    questions AS q,
    assessments AS a
WHERE
    aq.manual_points IS NULL
    AND a.id = aq.assessment_id
    AND q.id = aq.question_id;
