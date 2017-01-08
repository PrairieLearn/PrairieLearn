CREATE MATERIALIZED VIEW IF NOT EXISTS user_assessment_durations AS
SELECT
    u.user_id,
    e.role,
    a.id AS assessment_id,
    max(durations.duration) AS duration
FROM users AS u
JOIN assessment_instances AS ai ON (ai.user_id = u.user_id)
JOIN assessments AS a ON (a.id = ai.assessment_id)
JOIN assessment_instance_durations AS durations ON (durations.id = ai.id)
JOIN enrollments AS e ON (e.user_id = u.user_id AND e.course_instance_id = a.course_instance_id)
WHERE a.deleted_at IS NULL
GROUP BY u.user_id, a.id, e.role
;

CREATE UNIQUE INDEX IF NOT EXISTS user_assessment_durations_idx ON user_assessment_durations (assessment_id,user_id);
