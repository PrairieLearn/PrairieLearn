-- BLOCK select_and_auth
WITH
  issue_count AS (
    SELECT
      count(*) AS open_issue_count
    FROM
      issues AS i
    WHERE
      i.question_id = $question_id
      AND i.course_caused
      AND i.open
  )
SELECT
  to_json(q) AS question,
  to_json(top) AS topic,
  tags_for_question (q.id) AS tags,
  issue_count.open_issue_count
FROM
  questions as q
  JOIN topics as top ON (top.id = q.topic_id),
  issue_count
WHERE
  q.id = $question_id
  AND q.course_id = $course_id -- I'm not really sure what to do here. This authorization is used for TONS of stuff.
                               -- We probably want to keep this constraint for most cases (e.g. editing quesiton files, etc.),
                               -- but then for the case where an instructor is viewing a question shared with their course, allow it.
  AND q.deleted_at IS NULL;

-- BLOCK select_and_auth_with_course_instance
WITH
  issue_count AS (
    SELECT
      count(*) AS open_issue_count
    FROM
      issues AS i
    WHERE
      i.question_id = $question_id
      AND i.course_caused
      AND i.open
  )
SELECT
  to_json(q) AS question,
  to_json(top) AS topic,
  tags_for_question (q.id) AS tags,
  assessments_format_for_question (q.id, ci.id) AS assessments,
  issue_count.open_issue_count
FROM
  questions as q
  JOIN topics as top ON (top.id = q.topic_id),
  course_instances AS ci,
  issue_count
WHERE
  q.id = $question_id
  AND ci.id = $course_instance_id
  AND q.course_id = ci.course_id -- if the course_instance is included in the URL, this one is used. Otherwise, the one above is used.
  AND q.deleted_at IS NULL;
