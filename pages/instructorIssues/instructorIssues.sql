-- BLOCK issues_count
WITH counts AS (
    SELECT
        i.open,
        count(*)::int
    FROM issues AS i
    WHERE
        i.course_id = $course_id
        AND i.course_caused
    GROUP BY i.open
)
SELECT
    open,
    coalesce(count, 0) AS count
FROM
    (VALUES (true), (false)) AS tmp(open)
    LEFT JOIN counts USING (open)
ORDER BY open;

-- BLOCK select_issues
SELECT
    i.id AS issue_id,
    i.display_id,
    format_date_full_compact(now(), coalesce(ci.display_timezone, c.display_timezone)) AS now_date,
    format_date_full_compact(i.date, coalesce(ci.display_timezone, c.display_timezone)) AS formatted_date,
    ci.short_name AS course_instance_short_name,
    CASE WHEN i.assessment_id IS NOT NULL THEN assessments_format(i.assessment_id) ELSE NULL END AS assessment,
    i.question_id,
    q.directory AS question_qid,
    u.uid AS user_uid,
    i.student_message,
    i.variant_id,
    i.open,
    i.manually_reported
FROM
    issues AS i
    JOIN pl_courses AS c ON (c.id = i.course_id)
    LEFT JOIN course_instances AS ci ON (ci.id = i.course_instance_id)
    LEFT JOIN assessments AS a ON (a.id = i.assessment_id)
    LEFT JOIN questions AS q ON (q.id = i.question_id)
    LEFT JOIN users AS u ON (u.user_id = i.user_id)
WHERE
    i.course_id = $course_id
    AND i.course_caused
    AND (($filter_is_open::boolean IS NULL) OR (i.open = $filter_is_open::boolean))
    AND (($filter_is_closed::boolean IS NULL) OR (i.open != $filter_is_closed::boolean))
    AND (($filter_manually_reported::boolean IS NULL) OR (i.manually_reported = $filter_manually_reported::boolean))
    AND (($filter_qids::text[] IS NULL) OR (q.qid ILIKE ANY($filter_qids::text[])))
    AND (($filter_not_qids::text[] IS NULL) OR (q.qid NOT ILIKE ANY($filter_not_qids::text[])))
    AND (($filter_users::text[] IS NULL) OR (u.uid ILIKE ANY($filter_users::text[])))
    AND (($filter_not_users::text[] IS NULL) OR (u.uid NOT ILIKE ANY($filter_not_users::text[])))
    AND (($filter_query_text::text IS NULL) OR (to_tsvector(concat_ws(' ', q.directory, u.uid, i.student_message)) @@ plainto_tsquery($filter_query_text::text)))
ORDER BY
    i.date DESC, i.id
LIMIT
    $limit
OFFSET
    $offset;
