-- BLOCK select_assessments
WITH issue_count AS (
    SELECT
        a.id AS assessment_id,
        count(*) AS open_issue_count
    FROM
        assessments AS a
        JOIN issues AS i ON (i.assessment_id = a.id)
    WHERE
        a.course_instance_id = $course_instance_id
        AND i.course_caused
        AND i.open
    GROUP BY a.id
)
SELECT
    a.id::int,
    a.tid,
    a.type,
    a.number as assessment_number,
    a.title,
    a.assessment_set_id::int,
    aset.abbreviation AS assessment_set_abbreviation,
    aset.name AS assessment_set_name,
    aset.heading AS assessment_set_heading,
    aset.color AS assessment_set_color,
    (aset.abbreviation || a.number) as label
FROM
    assessments AS a
    JOIN course_instances AS ci ON (ci.id = a.course_instance_id)
    LEFT JOIN assessment_sets AS aset ON (aset.id = a.assessment_set_id)
    LEFT JOIN LATERAL authz_assessment(a.id, $authz_data, $req_date, ci.display_timezone) AS aa ON TRUE
WHERE
    ci.id = $course_instance_id
    AND a.deleted_at IS NULL
    AND aa.authorized
    AND ($assessment_id::bigint IS NULL OR a.id = $assessment_id)
ORDER BY
    aset.number, a.order_by, a.id;