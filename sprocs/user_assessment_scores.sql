CREATE OR REPLACE VIEW user_assessment_scores AS
SELECT
    u.user_id,
    a.id AS assessment_id,
    max(ai.score_perc) AS score_perc
FROM users AS u
JOIN assessment_instances AS ai ON (ai.user_id = u.user_id)
JOIN assessments AS a ON (a.id = ai.assessment_id)
WHERE a.deleted_at IS NULL
GROUP BY u.user_id, a.id;
