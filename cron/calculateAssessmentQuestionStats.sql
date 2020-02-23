-- BLOCK select_assessments
SELECT *
FROM assessments AS a
WHERE EXISTS (
    SELECT *
    FROM assessment_instances AS ai
    WHERE ai.modified_at > a.stats_last_updated
);
