-- BLOCK select_course_info
WITH
select_course_users AS (
    SELECT
        coalesce(jsonb_agg(jsonb_build_object(
            'id', u.id,
            'uid', u.uid,
            'name', u.name,
            'course_role', cp.course_role
        ) ORDER BY u.uid, u.id), '[]'::jsonb) AS course_users
    FROM
        course_permissions AS cp
        JOIN users AS u ON (u.id = cp.user_id)
    WHERE
        cp.course_id = $course_id
),
select_assessment_sets AS (
    SELECT
        coalesce(jsonb_agg(to_jsonb(aset.*) ORDER BY aset.number), '[]'::jsonb) AS assessment_sets
    FROM
        assessment_sets AS aset
    WHERE
        aset.course_id = $course_id
),
select_topics AS (
    SELECT
        coalesce(jsonb_agg(to_jsonb(topic.*) ORDER BY topic.number), '[]'::jsonb) AS topics
    FROM
        topics AS topic
    WHERE
        topic.course_id = $course_id
),
select_tags AS (
    SELECT
        coalesce(jsonb_agg(to_jsonb(tag.*) ORDER BY tag.number), '[]'::jsonb) AS tags
    FROM
        tags AS tag
    WHERE
        tag.course_id = $course_id
)
SELECT
    select_course_users.course_users,
    select_assessment_sets.assessment_sets,
    select_topics.topics,
    select_tags.tags
FROM
    select_course_users,
    select_assessment_sets,
    select_topics,
    select_tags;
