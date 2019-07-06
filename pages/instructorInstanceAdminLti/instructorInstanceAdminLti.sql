-- BLOCK lti_data
WITH
course_assessments AS (
    SELECT
    jsonb_agg(jsonb_build_object(
                'assessment_id', a.id,
                'label', (aset.abbreviation || a.number),
                'title', a.title,
                'tid', a.tid
            ) ORDER BY (aset.number, a.order_by, a.id)) as assessments
    FROM assessments AS a
    JOIN assessment_sets AS aset ON (aset.id = a.assessment_set_id)
    WHERE a.deleted_at IS NULL
    AND a.course_instance_id = $course_instance_id
),
lti_credentials AS (
    SELECT
    jsonb_agg(jsonb_build_object(
        'id', lc.id,
        'course_instance_id', lc.course_instance_id,
        'consumer_key', lc.consumer_key,
        'secret', lc.secret,
        'created', format_date_full_compact(lc.created_at, ci.display_timezone),
        'deleted', format_date_full_compact(lc.deleted_at, ci.display_timezone),
        'created_at', lc.created_at
    ) ORDER BY (lc.created_at)) as lti_credentials
    FROM lti_credentials AS lc
    JOIN course_instances AS ci ON(ci.id = lc.course_instance_id)
    WHERE course_instance_id = $course_instance_id
),
lti_links AS (
    SELECT
    jsonb_agg(jsonb_build_object(
        'id', ll.id,
        'resource_link_title', ll.resource_link_title,
        'resource_link_description', ll.resource_link_description,
        'assessment_id', ll.assessment_id,
        'created_at', ll.created_at,
        'created', format_date_full_compact(ll.created_at, ci.display_timezone)
    ) ORDER BY created_at) AS lti_links
    FROM
        lti_links AS ll
        JOIN course_instances AS ci ON(ci.id = ll.course_instance_id)
    WHERE course_instance_id = $course_instance_id
)
SELECT
    course_assessments.assessments,
    lti_credentials.lti_credentials,
    lti_links.lti_links
FROM
    course_assessments,
    lti_credentials,
    lti_links;

-- BLOCK update_link
UPDATE lti_links
SET assessment_id = $assessment_id
WHERE id=$id AND course_instance_id=$ci_id;

-- BLOCK insert_cred
INSERT INTO lti_credentials (course_instance_id, consumer_key, secret) VALUES
                            ($course_instance_id, $key, $secret)
;

-- BLOCK delete_cred
UPDATE lti_credentials
SET deleted_at = current_timestamp
WHERE id=$id AND course_instance_id=$ci_id;
