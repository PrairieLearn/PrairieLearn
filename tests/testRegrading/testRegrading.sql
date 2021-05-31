-- BLOCK select_exam
SELECT
    a.id
FROM
    assessments AS a
    JOIN assessment_sets AS aset ON (aset.id = a.assessment_set_id)
WHERE
    a.course_instance_id = 1
    AND aset.abbreviation = 'E'
    AND a.number = $exam_number;

-- BLOCK select_assessment_instances
SELECT
    ai.*
FROM
    assessment_instances AS ai;

-- BLOCK select_assessment_instances_with_assessment_id
SELECT
    ai.*
FROM
    assessment_instances AS ai
WHERE
    ai.assessment_id = $assessment_id;

-- BLOCK select_instance_questions
SELECT
    iq.*,
    q.qid
FROM
    instance_questions AS iq
    JOIN assessment_questions AS aq ON (aq.id = iq.assessment_question_id)
    JOIN questions AS q ON (q.id = aq.question_id)
ORDER BY
    q.qid;
