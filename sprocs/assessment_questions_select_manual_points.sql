CREATE FUNCTION
     assessment_questions_select_manual_points (
         aq assessment_questions,
         q questions
     ) RETURNS TABLE (
         manual_points DOUBLE PRECISION,
         max_auto_points DOUBLE PRECISION,
         init_points DOUBLE PRECISION,
         points_list DOUBLE PRECISION[]
     )
AS $$
-- Computes default values for these fields. Necessary to properly
-- obtain values of courses that were not sync'ed since manual points
-- were introduced.
SELECT
    COALESCE(aq.manual_points, CASE WHEN q.grading_method = 'Manual' THEN aq.max_points ELSE 0 END) AS manual_points,
    COALESCE(aq.max_auto_points, CASE WHEN q.grading_method = 'Manual' THEN 0 ELSE aq.max_points END) AS max_auto_points,
    CASE WHEN aq.manual_points IS NULL AND q.grading_method = 'Manual' THEN 0 ELSE aq.init_points END AS init_points,
    CASE WHEN aq.manual_points IS NULL AND q.grading_method = 'Manual' THEN NULL ELSE aq.points_list END AS points_list;
$$ LANGUAGE SQL STABLE;
