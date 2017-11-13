-- BLOCK select_last_submission
SELECT *
FROM submissions
ORDER BY date DESC
LIMIT 1;

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
    AND a.tid = 'exam1'
    AND q.qid = 'addVectors';
