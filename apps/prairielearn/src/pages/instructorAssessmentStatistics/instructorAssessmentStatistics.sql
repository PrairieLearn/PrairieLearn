-- BLOCK select_assessment
SELECT
  a.*
FROM
  assessments AS a
WHERE
  a.id = $assessment_id;

-- BLOCK assessment_score_histogram_by_date
WITH
  assessment_instances_by_user_and_date AS (
    SELECT
      ai.user_id,
      avg(ai.score_perc) AS score_perc,
      date_trunc('day', ai.date AT TIME ZONE ci.display_timezone) AS date
    FROM
      assessment_instances AS ai
      JOIN assessments AS a ON (a.id = ai.assessment_id)
      JOIN course_instances AS ci ON (ci.id = a.course_instance_id)
      LEFT JOIN team_users AS gu ON (gu.team_id = ai.team_id)
      JOIN users AS u ON (
        u.id = ai.user_id
        OR u.id = gu.user_id
      )
      JOIN enrollments AS e ON (
        e.user_id = u.id
        AND e.course_instance_id = ci.id
      )
    WHERE
      ai.assessment_id = $assessment_id
      AND NOT users_is_instructor_in_course_instance (e.user_id, e.course_instance_id)
    GROUP BY
      ai.user_id,
      date_trunc('day', date AT TIME ZONE ci.display_timezone)
  )
SELECT
  ai_by_user_and_date.date,
  count(score_perc)::integer AS number,
  avg(score_perc) AS mean_score_perc,
  histogram (score_perc, 0, 100, 10)
FROM
  assessment_instances_by_user_and_date AS ai_by_user_and_date
GROUP BY
  ai_by_user_and_date.date
ORDER BY
  ai_by_user_and_date.date;

-- BLOCK user_scores
SELECT
  ai.score_perc,
  ai.duration
FROM
  assessment_instances AS ai
  JOIN assessments AS a ON (a.id = ai.assessment_id)
  JOIN course_instances AS ci ON (ci.id = a.course_instance_id)
  JOIN users AS u ON (u.id = ai.user_id)
  JOIN enrollments AS e ON (
    e.user_id = u.id
    AND e.course_instance_id = ci.id
  )
WHERE
  ai.assessment_id = $assessment_id
  AND NOT users_is_instructor_in_course_instance (e.user_id, e.course_instance_id);
