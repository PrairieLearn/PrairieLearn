-- BLOCK questions
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
  coalesce(issue_count.open_issue_count, 0) AS open_issue_count,
  row_to_json(top) AS topic,
  tags_for_question (q.id) AS tags,
  assessments_format_for_question (q.id, NULL) AS assessments
FROM
  questions AS q
  JOIN topics AS top ON (top.id = q.topic_id)
  LEFT JOIN issue_count ON (issue_count.question_id = q.id)
WHERE
  q.course_id = $course_id -- TODO: change when we have a way for instructors to view questions shared with their course
  AND q.deleted_at IS NULL
GROUP BY
  q.id,
  top.id,
  issue_count.open_issue_count
ORDER BY
  q.qid;

-- BLOCK select_question_id_from_uuid
SELECT
  q.id AS question_id
FROM
  questions AS q
WHERE
  q.uuid = $uuid
  AND q.course_id = $course_id -- TODO: change when we have a way for instructors to view questions shared with their course
  AND q.deleted_at IS NULL;

-- BLOCK template_questions
WITH
  base_courses AS (
    -- Done as a union so that two different indices may be used
    SELECT
      *
    FROM
      pl_courses AS c
    WHERE
      c.example_course
    UNION
    SELECT
      *
    FROM
      pl_courses AS c
    WHERE
      c.id = $course_id
  )
SELECT
  c.example_course,
  JSON_AGG(
    q.*
    ORDER BY
      q.title
  ) AS questions
FROM
  base_courses AS c
  JOIN tags AS t ON (t.course_id = c.id)
  JOIN question_tags AS qt ON (qt.tag_id = t.id)
  JOIN questions AS q ON (q.id = qt.question_id)
WHERE
  t.name = 'template'
GROUP BY
  c.id,
  c.example_course
ORDER BY
  c.example_course;
