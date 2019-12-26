-- BLOCK select_hw1
SELECT
    a.id
FROM
    assessments AS a
    JOIN assessment_sets AS aset ON (aset.id = a.assessment_set_id)
WHERE
    a.course_instance_id = 1
    AND aset.abbreviation = 'HW'
    AND a.number = '1';

-- BLOCK select_assessment_instances
SELECT
    ai.*
FROM
    assessment_instances AS ai;

-- BLOCK select_instance_questions
SELECT
    iq.*,
    q.qid
FROM
    instance_questions AS iq
    JOIN assessment_questions AS aq ON (aq.id = iq.assessment_question_id)
    JOIN questions AS q ON (q.id = aq.question_id)
ORDER BY
    aq.number;

-- BLOCK select_last_submission
SELECT *
FROM submissions
ORDER BY date DESC
LIMIT 1;

-- BLOCK update_max_points
UPDATE assessments
SET
    max_points = 13
WHERE
    tid = 'hw1-automaticTestSuite';
