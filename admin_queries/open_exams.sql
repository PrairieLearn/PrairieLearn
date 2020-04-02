SELECT
    a.number, a.title, count(*) as count
FROM

    assessment_instances AS ai
    JOIN assessments AS a on (a.id = ai.assessment_id)
    JOIN assessment_sets AS aset ON (aset.id = a.assessment_set_id)
    JOIN course_instances AS ci ON (ci.id = a.course_instance_id)
    JOIN 
WHERE
    a.type = 'Exam'
    AND ai.open = true
    AND a.deleted_at IS NULL
GROUP BY
    assessment_id,a.number,a.title
;
