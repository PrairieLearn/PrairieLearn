WITH
    multiple_instance_assessments AS (
        SELECT
            a.id AS assessment_id,
            a.number AS assessment_number,
            a.title AS assessment_title,
            aset.id AS assessment_set_id,
            aset.abbrev AS assessment_set_abbrev,
            aset.name AS assessment_set_name,
            aset.heading AS assessment_set_heading,
            aset.color AS assessment_set_color,
            aset.number AS assessment_set_number,
            cta.available,
            cta.credit,
            NULL::integer AS assessment_instance_id,
            NULL::integer AS assessment_instance_number,
            NULL::integer AS assessment_instance_score_perc
        FROM
            assessments AS a
            JOIN assessment_sets AS aset ON (aset.id = a.assessment_set_id)
            LEFT JOIN LATERAL check_assessment_access(a.id, $mode::enum_mode, $role::enum_role, $uid, current_timestamp) AS cta ON TRUE
        WHERE
            a.multiple_instance
            AND a.deleted_at IS NULL
            AND a.course_instance_id = $courseInstanceId
    ),

    multiple_instance_assessment_instances AS (
        SELECT
            mia.assessment_id,
            mia.assessment_number,
            mia.assessment_title,
            mia.assessment_set_id,
            mia.assessment_set_abbrev,
            mia.assessment_set_name,
            mia.assessment_set_heading,
            mia.assessment_set_color,
            mia.assessment_set_number,
            mia.available,
            mia.credit,
            ai.id AS assessment_instance_id,
            ai.number AS assessment_instance_number,
            ai.score_perc AS assessment_instance_score_perc
        FROM
            assessment_instances AS ai
            JOIN multiple_instance_assessments AS mia ON (mia.assessment_id = ai.assessment_id)
        WHERE
            ai.user_id = $userId
    ),

    single_instance_assessments AS (
        SELECT
            a.id AS assessment_id,
            a.number AS assessment_number,
            a.title AS assessment_title,
            aset.id AS assessment_set_id,
            aset.abbrev AS assessment_set_abbrev,
            aset.name AS assessment_set_name,
            aset.heading AS assessment_set_heading,
            aset.color AS assessment_set_color,
            aset.number AS assessment_set_number,
            cta.available,
            cta.credit,
            ai.id AS assessment_instance_id,
            ai.number AS assessment_instance_number,
            ai.score_perc AS assessment_instance_score_perc
        FROM
            assessments AS a
            JOIN assessment_sets AS aset ON (aset.id = a.assessment_set_id)
            LEFT JOIN assessment_instances AS ai ON (ai.assessment_id = a.id AND ai.user_id = $userId)
            LEFT JOIN LATERAL check_assessment_access(a.id, $mode::enum_mode, $role::enum_role, $uid, current_timestamp) AS cta ON TRUE
        WHERE
            NOT a.multiple_instance
            AND a.deleted_at IS NULL
            AND a.course_instance_id = $courseInstanceId
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
    (lag(assessment_set_id) OVER (PARTITION BY assessment_set_id ORDER BY assessment_number, assessment_id) IS NULL) AS start_new_set
FROM
    all_rows
WHERE
    available
ORDER BY
    assessment_set_number, assessment_number, assessment_id, assessment_instance_number NULLS FIRST;
