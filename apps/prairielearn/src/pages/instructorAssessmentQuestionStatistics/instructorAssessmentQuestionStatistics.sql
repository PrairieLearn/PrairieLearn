-- BLOCK select_assessment
SELECT
  to_jsonb(a) AS assessment
FROM
  assessments AS a
WHERE
  a.id = $assessment_id;

-- BLOCK assessment_stats_last_updated
SELECT
  CASE
    WHEN a.stats_last_updated IS NULL THEN 'never'
    ELSE format_date_full_compact (a.stats_last_updated, ci.display_timezone)
  END AS stats_last_updated
FROM
  assessments AS a
  JOIN course_instances AS ci ON (ci.id = a.course_instance_id)
WHERE
  a.id = $assessment_id
  -- BLOCK questions
SELECT
  c.short_name AS course_short_name,
  ci.short_name AS course_instance_short_name,
  (aset.abbreviation || a.number) as assessment_label,
  aq.*,
  q.qid,
  q.title AS question_title,
  row_to_json(top) AS topic,
  q.id AS question_id,
  admin_assessment_question_number (aq.id) as assessment_question_number,
  ag.number AS alternative_group_number,
  ag.number_choose AS alternative_group_number_choose,
  (
    count(*) OVER (
      PARTITION BY
        ag.number
    )
  ) AS alternative_group_size,
  z.title AS zone_title,
  z.number AS zone_number,
  (
    lag(z.id) OVER (
      PARTITION BY
        z.id
      ORDER BY
        aq.number
    ) IS NULL
  ) AS start_new_zone,
  (
    lag(ag.id) OVER (
      PARTITION BY
        ag.id
      ORDER BY
        aq.number
    ) IS NULL
  ) AS start_new_alternative_group
FROM
  assessment_questions AS aq
  JOIN questions AS q ON (q.id = aq.question_id)
  JOIN alternative_groups AS ag ON (ag.id = aq.alternative_group_id)
  JOIN zones AS z ON (z.id = ag.zone_id)
  JOIN topics AS top ON (top.id = q.topic_id)
  JOIN assessments AS a ON (a.id = aq.assessment_id)
  JOIN assessment_sets AS aset ON (aset.id = a.assessment_set_id)
  JOIN course_instances AS ci ON (ci.id = a.course_instance_id)
  JOIN pl_courses AS c ON (c.id = ci.course_id)
WHERE
  a.id = $assessment_id
  AND aq.deleted_at IS NULL
  AND q.deleted_at IS NULL
ORDER BY
  z.number,
  z.id,
  aq.number;
