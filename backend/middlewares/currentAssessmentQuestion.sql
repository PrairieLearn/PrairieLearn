-- check that the requested assessment question is in the current assessment
SELECT
    aq.*
FROM
    assessment_questions AS aq
WHERE
    aq.id = $assessment_question_id
    AND aq.assessment_id = $assessment_id;
