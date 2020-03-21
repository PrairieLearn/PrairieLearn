-- BLOCK select_last_submission
SELECT *
FROM submissions
ORDER BY date DESC
LIMIT 1;

-- BLOCK select_variants_for_qid
SELECT v.id AS variant_id
FROM
    variants AS v
    JOIN questions AS q ON (q.id = v.question_id)
WHERE q.qid = $qid;

-- BLOCK close_all_assessment_instances
UPDATE assessment_instances
SET open = false;

-- BLOCK update_addVectors_force_max_points
UPDATE assessment_questions AS aq
SET
    force_max_points = TRUE
FROM
    assessments AS a,
    questions AS q
WHERE
    a.id = aq.assessment_id
    AND q.id = aq.question_id
    AND a.tid = 'exam1-automaticTestSuite'
    AND q.qid = 'addVectors';

-- BLOCK select_submissions_by_qid
SELECT s.*
FROM
    submissions AS s
    JOIN variants AS v ON (v.id = s.variant_id)
    JOIN instance_questions AS iq ON (iq.id = v.instance_question_id)
    JOIN assessment_questions AS aq ON (aq.id = iq.assessment_question_id)
    JOIN questions AS q ON (q.id = aq.question_id)
WHERE
    q.qid = $qid
ORDER BY s.date;
