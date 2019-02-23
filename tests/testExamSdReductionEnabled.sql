-- BLOCK select_e7
SELECT
    a.id
FROM
    assessments AS a
    JOIN assessment_sets AS aset ON (aset.id = a.assessment_set_id)
WHERE
    a.course_instance_id = 1
    AND aset.abbreviation = 'E'
    AND a.number = '7';

-- BLOCK select_question_statistics_for_addNumbers_question
SELECT
    *
FROM
    question_statistics AS qs
    JOIN questions AS q ON (qs.question_id = q.id)
WHERE
    q.qid='addNumbers';

-- BLOCK insert_addNumbers_question_statistics
INSERT INTO
    question_statistics(domain, mean_question_score, question_score_variance)
VALUES (
    'Exams', '80', '20'
);

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
