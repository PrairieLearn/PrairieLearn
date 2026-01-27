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
  to_jsonb(aq.*) AS assessment_question,
  to_jsonb(q.*) AS question,
  to_jsonb(top.*) AS topic,
  to_jsonb(ag.*) AS alternative_group,
  to_jsonb(z.*) AS zone,
  to_jsonb(a.*) AS assessment,
  to_jsonb(ci.*) AS course_instance,
  to_jsonb(c.*) AS course,
  coalesce(ic.open_issue_count, 0)::integer AS open_issue_count,
  (
    SELECT
      jsonb_agg(t.*)
    FROM
      tags t
      JOIN question_tags qt ON qt.tag_id = t.id
    WHERE
      qt.question_id = q.id
  ) AS tags,
  (
    SELECT
      jsonb_agg(
        jsonb_build_object(
          'assessment_set_abbreviation',
          aset.abbreviation,
          'assessment_set_name',
          aset.name,
          'assessment_number',
          a2.number,
          'assessment_id',
          a2.id,
          'assessment_course_instance_id',
          a2.course_instance_id,
          'assessment_share_source_publicly',
          a2.share_source_publicly,
          'assessment_set_color',
          aset.color
        )
      )
    FROM
      assessments a2
      JOIN assessment_sets aset ON aset.id = a2.assessment_set_id
      JOIN assessment_questions aq2 ON aq2.assessment_id = a2.id
    WHERE
      aq2.question_id = q.id
      AND a2.id != a.id
      AND a2.course_instance_id = a.course_instance_id
      AND aq2.deleted_at IS NULL
      AND a2.deleted_at IS NULL
  ) AS other_assessments
FROM
  assessment_questions AS aq
  JOIN questions AS q ON (q.id = aq.question_id)
  JOIN alternative_groups AS ag ON (ag.id = aq.alternative_group_id)
  JOIN zones AS z ON (z.id = ag.zone_id)
  JOIN topics AS top ON (top.id = q.topic_id)
  JOIN assessments AS a ON (a.id = aq.assessment_id)
  JOIN course_instances AS ci ON (ci.id = a.course_instance_id)
  LEFT JOIN issue_count AS ic ON (ic.question_id = q.id)
  LEFT JOIN courses AS c ON (q.course_id = c.id)
WHERE
  a.id = $assessment_id
  AND aq.deleted_at IS NULL
  AND q.deleted_at IS NULL
ORDER BY
  z.number,
  z.id,
  aq.number;
