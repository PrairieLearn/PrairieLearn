-- BLOCK select_assessment_instances
SELECT
    a.number AS assessment_number,
    a.order_by AS assessment_order_by,
    CASE
        WHEN a.multiple_instance THEN a.title || ' (' || COUNT(ai.id) || ' instances)'
        ELSE a.title
    END AS title,
    aset.abbreviation AS assessment_set_abbreviation,
    aset.name AS assessment_set_name,
    aset.heading AS assessment_set_heading,
    aset.color AS assessment_set_color,
    aset.number AS assessment_set_number,
    CASE
        WHEN a.multiple_instance THEN aset.abbreviation || a.number
        ELSE aset.abbreviation || a.number
    END AS label,
    MAX(ai.score_perc) AS assessment_instance_score_perc,
    (lag(assessment_set_id) OVER (PARTITION BY aset.id ORDER BY a.order_by, a.id) IS NULL) AS start_new_set
FROM
    assessment_instances AS ai
    JOIN assessments AS a ON (a.id = ai.assessment_id)
    JOIN course_instances AS ci ON (ci.id = a.course_instance_id)
    JOIN assessment_sets AS aset ON (aset.id = a.assessment_set_id)
WHERE
    ci.id = $course_instance_id
    AND ai.user_id = $user_id
    AND a.deleted_at IS NULL
GROUP BY
    aset.id, aset.abbreviation, aset.name, aset.heading, aset.color, aset.number, a.id
ORDER BY
    aset.number, a.order_by, a.id;
