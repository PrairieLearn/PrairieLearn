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
    jsonb_agg(lti_credentials) as lti_credentials
    FROM lti_credentials WHERE course_instance_id = $course_instance_id
),
lti_links AS (
    SELECT
        jsonb_agg(lti_links ORDER BY created_at) AS lti_links
    FROM
        lti_links
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
UPDATE lti_links SET assessment_id = $assessment_id WHERE id=$id;

-- BLOCK insert_cred
INSERT INTO lti_credentials (course_instance_id, consumer_key, secret) VALUES
                            ($course_instance_id, $key, $secret)
;
