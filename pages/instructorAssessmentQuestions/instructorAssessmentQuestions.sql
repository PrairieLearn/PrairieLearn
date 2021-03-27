-- BLOCK questions
WITH issue_count AS (
    SELECT
        q.id AS question_id,
        count(*) AS open_issue_count
    FROM
        issues AS i
        JOIN questions AS q ON (q.id = i.question_id)
    WHERE
        i.assessment_id = $assessment_id
        AND i.course_caused
        AND i.open
    GROUP BY q.id
),
question_scores AS (
    SELECT
        aq.question_id,
        avg(aq.mean_question_score) AS question_score
    FROM
        assessment_questions AS aq
    WHERE
        aq.assessment_id = $assessment_id
    GROUP BY
        aq.question_id
),
tags_list AS (
    SELECT
        aq.id AS assessment_question_id,
        string_agg(tags.name, ';' ORDER BY tags.number) AS tags_string
    FROM
        assessment_questions AS aq
        JOIN questions AS q ON (q.id = aq.question_id)
        JOIN question_tags AS qt ON (qt.question_id = q.id)
        JOIN tags ON (tags.id = qt.tag_id)
    WHERE
        aq.assessment_id = $assessment_id
    GROUP BY
        aq.id
)
SELECT
    aq.*,q.qid,q.title,tags_list.tags_string,row_to_json(top) AS topic,
    q.id AS question_id,
    admin_assessment_question_number(aq.id) as number,
    tags_for_question(q.id) AS tags,
    ag.number AS alternative_group_number,
    ag.number_choose AS alternative_group_number_choose,
    (count(*) OVER (PARTITION BY ag.number)) AS alternative_group_size,
    z.title AS zone_title,z.number AS zone_number,
    z.number_choose as zone_number_choose,
    (lag(z.id) OVER (PARTITION BY z.id ORDER BY aq.number) IS NULL) AS start_new_zone,
    (lag(ag.id) OVER (PARTITION BY ag.id ORDER BY aq.number) IS NULL) AS start_new_alternative_group,
    assessments_format_for_question(q.id,ci.id,a.id) AS other_assessments,
    coalesce(ic.open_issue_count, 0) AS open_issue_count,
    question_scores.question_score AS avg_question_score_perc,
    z.max_points AS zone_max_points,
    (z.max_points IS NOT NULL) AS zone_has_max_points,
    z.best_questions AS zone_best_questions,
    (z.best_questions IS NOT NULL) AS zone_has_best_questions
FROM
    assessment_questions AS aq
    JOIN questions AS q ON (q.id = aq.question_id)
    JOIN alternative_groups AS ag ON (ag.id = aq.alternative_group_id)
    JOIN zones AS z ON (z.id = ag.zone_id)
    JOIN topics AS top ON (top.id = q.topic_id)
    JOIN assessments AS a ON (a.id = aq.assessment_id)
    JOIN course_instances AS ci ON (ci.id = a.course_instance_id)
    LEFT JOIN tags_list ON (tags_list.assessment_question_id = aq.id)
    LEFT JOIN issue_count AS ic ON (ic.question_id = q.id)
    LEFT JOIN question_scores ON (question_scores.question_id = q.id)
WHERE
    a.id = $assessment_id
    AND aq.deleted_at IS NULL
    AND q.deleted_at IS NULL
ORDER BY z.number, z.id, aq.number;
