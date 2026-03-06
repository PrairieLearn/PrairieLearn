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
  q.workspace_image,
  CASE
    WHEN q.type = 'Freeform' THEN 'v3'
    ELSE 'v2 (' || q.type || ')'
  END AS display_type,
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
  q.share_publicly,
  q.share_source_publicly,
  (
    SELECT
      jsonb_agg(to_jsonb(ss))
    FROM
      sharing_set_questions AS ssq
      JOIN sharing_sets AS ss ON (ss.id = ssq.sharing_set_id)
    WHERE
      ssq.question_id = q.id
  ) AS sharing_sets,
  COALESCE(
    (
      SELECT
        jsonb_agg(
          jsonb_build_object(
            'assessment',
            jsonb_build_object(
              'id',
              a.id,
              'course_instance_id',
              a.course_instance_id,
              'number',
              a.number
            ),
            'assessment_set',
            jsonb_build_object(
              'abbreviation',
              aset.abbreviation,
              'color',
              aset.color,
              'name',
              aset.name
            )
          )
          ORDER BY
            aset.number,
            aset.id,
            a.number,
            a.id
        )
      FROM
        assessment_questions AS aq
        JOIN assessments AS a ON (a.id = aq.assessment_id)
        JOIN assessment_sets AS aset ON (aset.id = a.assessment_set_id)
      WHERE
        aq.question_id = q.id
        AND aq.deleted_at IS NULL
        AND a.deleted_at IS NULL
    ),
    '[]'::jsonb
  ) AS assessments
FROM
  questions AS q
  JOIN topics AS top ON (top.id = q.topic_id)
  LEFT JOIN issue_count ON (issue_count.question_id = q.id)
WHERE
  q.course_id = $course_id
  AND q.deleted_at IS NULL
  AND q.draft IS FALSE
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
  q.workspace_image,
  CASE
    WHEN q.type = 'Freeform' THEN 'v3'
    ELSE 'v2 (' || q.type || ')'
  END AS display_type,
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
  q.share_publicly,
  q.share_source_publicly
FROM
  questions AS q
  JOIN topics AS top ON (top.id = q.topic_id)
WHERE
  q.course_id = $course_id
  AND q.deleted_at IS NULL
  AND q.draft IS FALSE
  AND (
    q.share_publicly
    OR q.share_source_publicly
  )
GROUP BY
  q.id,
  top.id
ORDER BY
  q.qid;
