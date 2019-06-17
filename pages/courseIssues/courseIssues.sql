-- BLOCK issues_count
WITH counts AS (
    SELECT
        i.open,
        count(*)::int
    FROM
        issues AS i
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
    format_date_iso8601(now(), coalesce(ci.display_timezone, c.display_timezone)) AS now_date,
    format_date_iso8601(i.date, coalesce(ci.display_timezone, c.display_timezone)) AS formatted_date,
    ci.short_name AS course_instance_short_name,
    CASE WHEN i.assessment_id IS NOT NULL THEN assessments_format(i.assessment_id) ELSE NULL END AS assessment,
    i.question_id,
    q.directory AS question_qid,
    u.uid AS user_uid,
    u.name AS user_name,
    i.student_message,
    i.variant_id,
    i.open,
    i.manually_reported
FROM
    issues_select_with_filter (
        $filter_is_open,
        $filter_is_closed,
        $filter_manually_reported,
        $filter_automatically_reported,
        $filter_qids,
        $filter_not_qids,
        $filter_users,
        $filter_not_users,
        $filter_query_text
    ) AS selected_issues
    JOIN issues AS i ON (i.id = selected_issues.issue_id)
    JOIN pl_courses AS c ON (c.id = i.course_id)
    LEFT JOIN course_instances AS ci ON (ci.id = i.course_instance_id)
    LEFT JOIN assessments AS a ON (a.id = i.assessment_id)
    LEFT JOIN questions AS q ON (q.id = i.question_id)
    LEFT JOIN users AS u ON (u.user_id = i.user_id)
WHERE
    i.course_id = $course_id
    AND i.course_caused
ORDER BY
    i.date DESC, i.id
LIMIT
    $limit
OFFSET
    $offset;
