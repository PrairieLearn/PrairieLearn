-- BLOCK select_assessments
WITH
    multiple_instance_assessments AS (
        SELECT
            TRUE AS multiple_instance_header,
            a.id AS assessment_id,
            a.number AS assessment_number,
            a.order_by AS assessment_order_by,
            a.title AS title,
            aset.id AS assessment_set_id,
            aset.abbreviation AS assessment_set_abbreviation,
            aset.name AS assessment_set_name,
            aset.heading AS assessment_set_heading,
            aset.color AS assessment_set_color,
            aset.number AS assessment_set_number,
            aset.abbreviation || a.number AS label,
            aa.authorized,
            aa.credit,
            aa.credit_date_string,
            aa.access_rules,
            NULL::integer AS assessment_instance_id,
            NULL::integer AS assessment_instance_number,
            NULL::integer AS assessment_instance_score_perc,
            NULL::boolean AS assessment_instance_open
        FROM
            assessments AS a
            JOIN course_instances AS ci ON (ci.id = a.course_instance_id)
            JOIN assessment_sets AS aset ON (aset.id = a.assessment_set_id)
            LEFT JOIN LATERAL authz_assessment(a.id, $authz_data, $req_date, ci.display_timezone) AS aa ON TRUE
        WHERE
            ci.id = $course_instance_id
            AND a.multiple_instance
            AND a.deleted_at IS NULL
    ),

    multiple_instance_assessment_instances AS (
        SELECT
            FALSE AS multiple_instance_header,
            mia.assessment_id,
            mia.assessment_number,
            mia.assessment_order_by,
            mia.title || ' instance #' || ai.number,
            mia.assessment_set_id,
            mia.assessment_set_abbreviation,
            mia.assessment_set_name,
            mia.assessment_set_heading,
            mia.assessment_set_color,
            mia.assessment_set_number,
            mia.label || '#' || ai.number AS label,
            mia.authorized,
            mia.credit,
            mia.credit_date_string,
            mia.access_rules,
            ai.id AS assessment_instance_id,
            ai.number AS assessment_instance_number,
            ai.score_perc AS assessment_instance_score_perc,
            ai.open AS assessment_instance_open
        FROM
            assessment_instances AS ai
            JOIN multiple_instance_assessments AS mia ON (mia.assessment_id = ai.assessment_id)
        WHERE
            ai.user_id = $user_id
    ),

    single_instance_assessments AS (
        SELECT
            FALSE AS multiple_instance_header,
            a.id AS assessment_id,
            a.number AS assessment_number,
            a.order_by AS assessment_order_by,
            a.title AS title,
            aset.id AS assessment_set_id,
            aset.abbreviation AS assessment_set_abbreviation,
            aset.name AS assessment_set_name,
            aset.heading AS assessment_set_heading,
            aset.color AS assessment_set_color,
            aset.number AS assessment_set_number,
            aset.abbreviation || a.number AS label,
            aa.authorized,
            aa.credit,
            aa.credit_date_string,
            aa.access_rules,
            ai.id AS assessment_instance_id,
            ai.number AS assessment_instance_number,
            ai.score_perc AS assessment_instance_score_perc,
            ai.open AS assessment_instance_open
        FROM
            assessments AS a
            JOIN course_instances AS ci ON (ci.id = a.course_instance_id)
            JOIN assessment_sets AS aset ON (aset.id = a.assessment_set_id)
            LEFT JOIN assessment_instances AS ai ON (ai.assessment_id = a.id AND ai.user_id = $user_id)
            LEFT JOIN LATERAL authz_assessment(a.id, $authz_data, $req_date, ci.display_timezone) AS aa ON TRUE
        WHERE
            ci.id = $course_instance_id
            AND NOT a.multiple_instance
            AND a.deleted_at IS NULL
    ),

    all_rows AS (
        SELECT * FROM multiple_instance_assessments
        UNION
        SELECT * FROM multiple_instance_assessment_instances
        UNION
        SELECT * FROM single_instance_assessments
    )

SELECT
    *,
    CASE
        WHEN assessment_instance_id IS NULL THEN '/assessment/' || assessment_id || '/'
        ELSE '/assessment_instance/' || assessment_instance_id || '/'
    END AS link,
    (lag(assessment_set_id) OVER (PARTITION BY assessment_set_id ORDER BY assessment_order_by, assessment_id, assessment_instance_number NULLS FIRST) IS NULL) AS start_new_set
FROM
    all_rows
WHERE
    authorized
ORDER BY
    assessment_set_number, assessment_order_by, assessment_id, assessment_instance_number NULLS FIRST;
