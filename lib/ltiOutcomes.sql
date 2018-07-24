-- BLOCK get_score
SELECT
    *
FROM
    assessment_instances AS ai
    JOIN lti_outcomes AS lo USING(assessment_id, user_id)
    JOIN lti_credentials AS lc ON(lc.id = lo.lti_credential_id)
WHERE
    ai.id = $ai_id
;
