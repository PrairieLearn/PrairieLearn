SELECT
    a.number, a.title, count(*) as count
FROM
    assessment_instances AS ai
    JOIN assessments AS a on (a.id = ai.assessment_id)
WHERE
    a.type = 'Exam'
    AND ai.open = true
    AND a.deleted_at IS NULL
GROUP BY
    assessment_id,a.number,a.title
;
