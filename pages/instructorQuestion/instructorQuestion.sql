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
    AND q.course_id = $course_id;
