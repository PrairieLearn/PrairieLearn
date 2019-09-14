-- BLOCK assessment_question_stats
SELECT
    aset.name || ' ' || a.number || ': ' || title AS title,
    ci.short_name AS course_title,
    a.id AS assessment_id,
    a.type AS type,
    a.course_instance_id,
    aset.color,
    (aset.abbreviation || a.number) as label,
    admin_assessment_question_number(aq.id) as number,
    aq.*
FROM
    assessment_questions AS aq
    JOIN assessments AS a ON (a.id = aq.assessment_id)
    JOIN assessment_sets AS aset ON (aset.id = a.assessment_set_id)
    JOIN course_instances AS ci ON (ci.id = a.course_instance_id)
WHERE
    aq.question_id=$question_id
    AND aq.deleted_at IS NULL
GROUP BY
    a.id,
    aq.id,
    aset.id,
    ci.id
ORDER BY
    admin_assessment_question_number(aq.id);

-- BLOCK qids
SELECT
    array_agg(q.qid) AS qids
FROM
    questions AS q
WHERE
    q.course_id = $course_id
    AND q.deleted_at IS NULL;

-- BLOCK select_question_id_from_qid
SELECT
    q.id AS question_id
FROM
    questions AS q
WHERE
    q.qid = $qid
    AND q.course_id = $course_id
    AND q.deleted_at IS NULL;

-- BLOCK select_assessments_with_question_for_display
SELECT
    jsonb_agg(jsonb_build_object(
        'title', result.course_title,
        'course_instance_id', result.course_instance_id,
        'assessments', result.matched_assessments
    )) AS assessments_from_question_id
FROM
    (
        SELECT
            ci.short_name AS course_title,
            ci.id AS course_instance_id,
            jsonb_agg(jsonb_build_object(
                'label', aset.abbreviation || a.number,
                'assessment_id', a.id,
                'color', aset.color
            ) ORDER BY admin_assessment_question_number(aq.id)) AS matched_assessments
        FROM
            assessment_questions AS aq
            JOIN assessments AS a ON (a.id = aq.assessment_id)
            JOIN assessment_sets AS aset ON (aset.id = a.assessment_set_id)
            JOIN course_instances AS ci ON (ci.id = a.course_instance_id)
        WHERE
            aq.question_id = $question_id
            AND aq.deleted_at IS NULL
            AND a.deleted_at IS NULL
            AND ci.deleted_at IS NULL
        GROUP BY
            ci.id
    ) result;

-- BLOCK select_assessments_with_question
SELECT
    ci.short_name AS course_instance_directory,
    a.tid AS assessment_directory
FROM
    assessment_questions AS aq
    JOIN assessments AS a ON (a.id = aq.assessment_id)
    JOIN course_instances AS ci ON (ci.id = a.course_instance_id)
WHERE
    aq.question_id = $question_id
    AND aq.deleted_at IS NULL
    AND a.deleted_at IS NULL
    AND ci.deleted_at IS NULL;

-- BLOCK select_temp_as_json
SELECT
    jsonb_agg(jsonb_build_object(
        'course_instance_directory', ci.short_name,
        'assessment_directory', a.tid
    ))
FROM
    assessment_questions AS aq
    JOIN assessments AS a ON (a.id = aq.assessment_id)
    JOIN course_instances AS ci ON (ci.id = a.course_instance_id)
WHERE
    aq.question_id = $question_id
    AND aq.deleted_at IS NULL
    AND a.deleted_at IS NULL
    AND ci.deleted_at IS NULL;
