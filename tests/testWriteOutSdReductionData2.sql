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

-- BLOCK insert_assessment_quintile_statistics
INSERT INTO
    assessment_quintile_statistics(assessment_id, quintile, mean_score, score_sd)
SELECT
    $assessment_id, $quintile, $mean_score, $score_sd;

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
    question_statistics(question_id, domain, mean_question_score, question_score_variance,
        incremental_submission_score_array_quintile_averages)
SELECT
    q.id,
    'Exams',
    '90',
    '20',
    '{{0.38,0.28,0.15},{0.52,0.21,0.15},{0.59,0.24,0.10},{0.66,0.23,0.02},{0.90,0.04,0.01}}'
FROM
    questions AS q
WHERE
    q.qid='addNumbers';

-- BLOCK insert_addVectors_question_statistics
INSERT INTO
    question_statistics(question_id, domain, mean_question_score, question_score_variance,
        incremental_submission_score_array_quintile_averages)
SELECT
    q.id,
    'Exams',
    '50',
    '20',
    '{{0.38,0.28,0.15},{0.52,0.21,0.15},{0.59,0.24,0.10},{0.66,0.23,0.02},{0.90,0.04,0.01}}'

FROM
    questions AS q
WHERE
    q.qid='addVectors';

-- BLOCK insert_partialCredit1_question_statistics
INSERT INTO
    question_statistics(question_id, domain, mean_question_score, question_score_variance,
        incremental_submission_score_array_quintile_averages)
SELECT
    q.id,
    'Exams',
    '50',
    '20',
    '{{0.38,0.28,0.15},{0.52,0.21,0.15},{0.59,0.24,0.10},{0.66,0.23,0.02},{0.90,0.04,0.01}}'

FROM
    questions AS q
WHERE
    q.qid='partialCredit1';

-- BLOCK insert_partialCredit2_question_statistics
INSERT INTO
    question_statistics(question_id, domain, mean_question_score, question_score_variance,
        incremental_submission_score_array_quintile_averages)
SELECT
    q.id,
    'Exams',
    '90',
    '20',
    '{{0.38,0.28,0.15},{0.52,0.21,0.15},{0.59,0.24,0.10},{0.66,0.23,0.02},{0.90,0.04,0.01}}'

FROM
    questions AS q
WHERE
    q.qid='partialCredit2';

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

-- BLOCK test_function
SELECT array_add('{1,2,3}', '{2,3,4}');

-- BLOCK insert_test_users
INSERT INTO users (user_id, uid) VALUES ($user_id, $uid);