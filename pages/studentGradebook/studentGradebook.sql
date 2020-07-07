-- BLOCK select_assessment_instances
WITH individual_instances AS (
SELECT
    a.id AS assessment_id,
    a.number AS assessment_number,
    a.order_by AS assessment_order_by,
    a.multiple_instance AS assessment_multiple_instance,
    a.title AS assessment_title,
    CASE
        WHEN a.multiple_instance THEN a.title || ' instance #' || ai.number
        ELSE a.title
    END AS title,
    aset.id AS assessment_set_id,
    aset.abbreviation AS assessment_set_abbreviation,
    aset.name AS assessment_set_name,
    aset.heading AS assessment_set_heading,
    aset.color AS assessment_set_color,
    aset.number AS assessment_set_number,
    CASE
        WHEN a.multiple_instance THEN aset.abbreviation || a.number || '#' || ai.number
        ELSE aset.abbreviation || a.number
    END AS label,
    ai.id AS assessment_instance_id,
    ai.number AS assessment_instance_number,
    ai.score_perc AS display_score_perc,
    a.multiple_instance AS collapse,
    false AS collapse_control,
    assessment_id AS collapse_id
FROM
    assessment_instances AS ai
    JOIN assessments AS a ON (a.id = ai.assessment_id)
    JOIN course_instances AS ci ON (ci.id = a.course_instance_id)
    JOIN assessment_sets AS aset ON (aset.id = a.assessment_set_id)
WHERE
    ci.id = $course_instance_id
    AND ai.user_id = $user_id
    AND a.deleted_at IS NULL
),
combined_instance_headers AS (
    SELECT
        ii.assessment_id AS assessment_id,
        MIN(ii.assessment_number) AS assessment_number,
        MIN(ii.assessment_order_by) AS assessment_order_by,
        true AS assessment_multiple_instance,
        MIN(ii.assessment_title) AS assessment_title,
        MIN(ii.assessment_title) AS title,
        MIN(ii.assessment_set_id) AS assessment_set_id,
        MIN(ii.assessment_set_abbreviation) AS assessment_set_abbreviation,
        MIN(ii.assessment_set_name) AS assessment_set_name,
        MIN(ii.assessment_set_heading) AS assessment_set_heading,
        MIN(ii.assessment_set_color) AS assessment_set_color,
        MIN(ii.assessment_set_number) AS assessment_set_number,
        MIN(ii.assessment_set_abbreviation) || MIN(ii.assessment_number) || '#' || MIN(ii.assessment_instance_number) || '-' || MAX(ii.assessment_instance_number) AS label,
        0 AS assessment_instance_id,
        0 AS assessment_instance_number,
        MAX(ii.display_score_perc) AS display_score_perc,
        false AS collapse,
        true AS collapse_control,
        ii.assessment_id AS collapse_id

    FROM individual_instances ii
    WHERE ii.assessment_multiple_instance = true
    GROUP BY
        ii.assessment_id
)
SELECT
    *,
    (lag(assessment_set_id) OVER (PARTITION BY assessment_set_id ORDER BY assessment_order_by, assessment_id, assessment_instance_number) IS NULL) AS start_new_set
FROM (
    SELECT * FROM individual_instances
    UNION ALL
    SELECT * FROM combined_instance_headers
) AS combined_rows
ORDER BY
    assessment_set_number, assessment_order_by, assessment_id, assessment_instance_number;
