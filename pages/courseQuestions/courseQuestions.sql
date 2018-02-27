-- BLOCK course_instance_list
WITH assessment_list AS (
    SELECT
        aset.abbreviation || a.number AS label,
        a.id AS assessment_id,
        aset.color AS color,
        ci.id AS course_instance_id,
        aset.number AS assessment_set_number,
        a.number AS assessment_number
    FROM
        assessments AS a
        JOIN assessment_sets AS aset ON (aset.id = a.assessment_set_id)
        JOIN course_instances AS ci ON (ci.id = a.course_instance_id)
    WHERE
        ci.deleted_at IS NULL
        AND a.deleted_at IS NULL
        AND ci.course_id = $course_id
    ORDER BY aset.number, a.number
)
SELECT
    ci.id AS course_instance_id,
    ci.number AS course_instance_number,
    ci.short_name AS course_instance_short_name,
    ARRAY_AGG(
        json_build_object(
            'label', al.label,
            'assessment_id', al.assessment_id,
            'color', al.color
        ) ORDER BY al.assessment_set_number, al.assessment_number
    ) as assessments
FROM
    course_instances AS ci
    JOIN assessment_list AS al ON (al.course_instance_id = ci.id)
WHERE
    ci.deleted_at IS NULL
    AND ci.course_id = $course_id
GROUP BY ci.id, ci.number, ci.short_name
ORDER BY
    ci.number DESC;

-- BLOCK questions
WITH issue_count AS (
    SELECT
        i.question_id,
        count(*) AS open_issue_count
    FROM issues AS i
    WHERE
        i.course_id = $course_id
        AND i.course_caused
        AND i.open
    GROUP BY i.question_id
),
course_instance_list AS (
    SELECT
        ci.id AS course_instance_id,
        ci.number AS course_instance_number,
        ci.short_name AS course_instance_short_name
    FROM course_instances AS ci
    WHERE ci.deleted_at IS NULL
          AND ci.course_id = $course_id
    ORDER BY course_instance_number DESC
),
question_list AS (
    SELECT
        q.id,
        ARRAY_AGG(
            json_build_object(
                'course_instance_id', cil.course_instance_id,
                'course_instance_number', cil.course_instance_number,
                'course_instance_short_name', cil.course_instance_short_name,
                'assessments', assessments_format_for_question(q.id, cil.course_instance_id)
            ) ORDER BY cil.course_instance_number DESC
        ) AS course_instances
    FROM questions AS q
         CROSS JOIN course_instance_list AS cil
    WHERE q.deleted_at IS NULL
          AND q.course_id = $course_id
    GROUP BY q.id
)
SELECT
    q.*,
    ql.course_instances AS course_instances,
    coalesce(issue_count.open_issue_count, 0) AS open_issue_count,
    row_to_json(top) AS topic,
    tags_for_question(q.id) AS tags
FROM
    questions AS q
    JOIN question_list AS ql ON (q.id = ql.id)
    JOIN topics AS top ON (top.id = q.topic_id)
    LEFT JOIN issue_count ON (issue_count.question_id = q.id)
WHERE
    q.course_id = $course_id
    AND q.deleted_at IS NULL
ORDER BY top.number, q.title;

-- BLOCK tags
SELECT tag.name AS name
FROM tags AS tag
WHERE tag.course_id = $course_id
ORDER BY tag.number;
