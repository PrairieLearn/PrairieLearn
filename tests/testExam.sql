-- BLOCK select_e1
SELECT
    a.id
FROM
    assessments AS a
    JOIN assessment_sets AS aset ON (aset.id = a.assessment_set_id)
WHERE
    a.course_instance_id = 1
    AND aset.abbreviation = 'E'
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

-- BLOCK variant_update_broken
UPDATE variants
SET broken = $broken
WHERE id = $variant_id
RETURNING *;

-- BLOCK submission_update_broken
WITH last_submission AS (
    SELECT *
    FROM submissions
    WHERE variant_id = $variant_id
    ORDER BY date DESC
    LIMIT 1
)
UPDATE submissions AS s
SET broken = $broken
FROM last_submission
WHERE s.id = last_submission.id
RETURNING *;

-- BLOCK update_question1_force_max_points
UPDATE assessment_questions AS aq
SET
    force_max_points = TRUE
FROM
    assessments AS a,
    questions AS q
WHERE
    a.id = aq.assessment_id
    AND q.id = aq.question_id
    AND a.tid = 'exam1'
    AND q.qid = 'addVectors';
