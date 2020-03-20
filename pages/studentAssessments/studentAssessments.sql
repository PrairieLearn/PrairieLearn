-- BLOCK select_assessments
WITH
    assessments_ AS (
        SELECT
            a.multiple_instance,
            a.id AS assessment_id,
            a.order_by AS assessment_order_by,
            a.title AS title,

            aset.id AS assessment_set_id,
            aset.name AS assessment_set_name,
            aset.heading AS assessment_set_heading,
            aset.color AS assessment_set_color,
            aset.number AS assessment_set_number,
            aset.abbreviation || a.number AS label,

            aa.authorized,
            aa.credit_date_string,
            aa.access_rules,

            count(ai.id) AS assessment_instance_count,
            max(ai.id) AS assessment_instance_id,
            max(ai.number) AS assessment_instance_number,
            max(ai.score_perc) AS assessment_instance_score_perc

        FROM
            assessments AS a
            JOIN course_instances AS ci ON (ci.id = a.course_instance_id)
            JOIN assessment_sets AS aset ON (aset.id = a.assessment_set_id)
            LEFT JOIN assessment_instances AS ai ON (ai.assessment_id = a.id AND ai.user_id = $user_id)
            LEFT JOIN LATERAL authz_assessment(a.id, $authz_data, $req_date, ci.display_timezone) AS aa ON TRUE

        WHERE
            ci.id = $course_instance_id
            AND a.deleted_at IS NULL

        GROUP BY
            a.id,
            aset.id,
            aa.authorized,
            aa.credit,
            aa.credit_date_string,
            aa.access_rules
)
SELECT
    *,
    CASE
        WHEN (multiple_instance = true OR assessment_instance_count = 0 ) THEN '/assessment/' || assessment_id || '/'
        ELSE '/assessment_instance/' || assessment_instance_id || '/'
    END AS link,
    (lag(assessment_set_id) OVER (PARTITION BY assessment_set_id ORDER BY assessment_order_by, assessment_id, assessment_instance_number NULLS FIRST) IS NULL) AS start_new_set
FROM
    assessments_
WHERE
    authorized
ORDER BY
    assessment_set_number, assessment_order_by, assessment_id, assessment_instance_number NULLS FIRST;
