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
    q.qid;

-- BLOCK select_instance_question
SELECT
    iq.*
FROM
    instance_questions AS iq
WHERE
    iq.id = $instance_question_id;

-- BLOCK select_assessment_instance
SELECT
    ai.*
FROM
    assessment_instances AS ai
WHERE
    ai.id = $assessment_instance_id;

-- BLOCK select_variants
SELECT
    v.*
FROM
    variants AS v
ORDER BY
    v.date;

-- BLOCK select_submissions
SELECT
    s.*
FROM
    submissions AS s
ORDER BY
    s.date;
