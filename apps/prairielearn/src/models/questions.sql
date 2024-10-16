-- BLOCK select_questions_for_course
WITH
  issue_count AS (
    SELECT
      i.question_id,
      count(*) AS open_issue_count
    FROM
      issues AS i
    WHERE
      i.course_id = $course_id
      AND i.course_caused
      AND i.open
    GROUP BY
      i.question_id
  )
SELECT
  q.id,
  q.qid,
  q.title,
  q.sync_errors,
  q.sync_warnings,
  q.grading_method,
  q.external_grading_image,
  case
    when q.type = 'Freeform' then 'v3'
    else 'v2 (' || q.type || ')'
  end AS display_type,
  coalesce(issue_count.open_issue_count, 0)::int AS open_issue_count,
  row_to_json(top) AS topic,
  (
    SELECT
      jsonb_agg(to_jsonb(tags))
    FROM
      question_tags AS qt
      JOIN tags ON (tags.id = qt.tag_id)
    WHERE
      qt.question_id = q.id
  ) AS tags,
  q.shared_publicly,
  (
    SELECT
      jsonb_agg(to_jsonb(ss))
    FROM
      sharing_set_questions AS ssq
      JOIN sharing_sets AS ss on (ss.id = ssq.sharing_set_id)
    WHERE
      ssq.question_id = q.id
  ) AS sharing_sets,
  assessments_format_for_question (q.id, NULL) AS assessments
FROM
  questions AS q
  JOIN topics AS top ON (top.id = q.topic_id)
  LEFT JOIN issue_count ON (issue_count.question_id = q.id)
WHERE
  q.course_id = $course_id
  AND q.deleted_at IS NULL
GROUP BY
  q.id,
  top.id,
  issue_count.open_issue_count
ORDER BY
  q.qid;

-- BLOCK select_public_questions_for_course
SELECT
  q.id,
  q.qid,
  q.title,
  q.grading_method,
  q.external_grading_image,
  case
    when q.type = 'Freeform' then 'v3'
    else 'v2 (' || q.type || ')'
  end AS display_type,
  row_to_json(top) AS topic,
  (
    SELECT
      jsonb_agg(to_jsonb(tags))
    FROM
      question_tags AS qt
      JOIN tags ON (tags.id = qt.tag_id)
    WHERE
      qt.question_id = q.id
  ) AS tags
FROM
  questions AS q
  JOIN topics AS top ON (top.id = q.topic_id)
WHERE
  q.course_id = $course_id
  AND q.deleted_at IS NULL
  AND q.shared_publicly
GROUP BY
  q.id,
  top.id
ORDER BY
  q.qid;

-- BLOCK select_assessment_questions
WITH
  issue_count AS (
    SELECT
      q.id AS question_id,
      count(*) AS open_issue_count
    FROM
      issues AS i
      JOIN questions AS q ON (q.id = i.question_id)
    WHERE
      i.assessment_id = $assessment_id
      AND i.course_caused
      AND i.open
    GROUP BY
      q.id
  )
SELECT
  aq.*,
  q.qid,
  q.title,
  row_to_json(top) AS topic,
  q.id AS question_id,
  admin_assessment_question_number (aq.id) as number,
  tags_for_question (q.id) AS tags,
  ag.number AS alternative_group_number,
  ag.number_choose AS alternative_group_number_choose,
  (
    count(*) OVER (
      PARTITION BY
        ag.number
    )::integer
  ) AS alternative_group_size,
  z.title AS zone_title,
  z.number AS zone_number,
  z.number_choose as zone_number_choose,
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
  ) AS start_new_alternative_group,
  assessments_format_for_question (q.id, ci.id, a.id) AS other_assessments,
  coalesce(ic.open_issue_count, 0) AS open_issue_count,
  z.max_points AS zone_max_points,
  (z.max_points IS NOT NULL) AS zone_has_max_points,
  z.best_questions AS zone_best_questions,
  (z.best_questions IS NOT NULL) AS zone_has_best_questions,
  aq.effective_advance_score_perc AS assessment_question_advance_score_perc,
  q.sync_errors,
  q.sync_warnings,
  CASE
    WHEN q.course_id = $course_id THEN qid
    ELSE '@' || c.sharing_name || '/' || q.qid
  END AS display_name
FROM
  assessment_questions AS aq
  JOIN questions AS q ON (q.id = aq.question_id)
  JOIN alternative_groups AS ag ON (ag.id = aq.alternative_group_id)
  JOIN zones AS z ON (z.id = ag.zone_id)
  JOIN topics AS top ON (top.id = q.topic_id)
  JOIN assessments AS a ON (a.id = aq.assessment_id)
  JOIN course_instances AS ci ON (ci.id = a.course_instance_id)
  LEFT JOIN issue_count AS ic ON (ic.question_id = q.id)
  LEFT JOIN pl_courses AS c ON (q.course_id = c.id)
WHERE
  a.id = $assessment_id
  AND aq.deleted_at IS NULL
  AND q.deleted_at IS NULL
ORDER BY
  z.number,
  z.id,
  aq.number;