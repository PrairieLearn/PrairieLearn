-- Each block returns exactly the columns of its dataset's schema in datasets.ts, limited to the course
-- in $course_id. The router wraps a block as a subquery to select, filter, sort, and limit its rows,
-- so joins should follow indexed paths down from course_instances. Keep each block a plain join,
-- without DISTINCT, GROUP BY, window functions, or LIMIT, so that Postgres flattens the wrapper and
-- reads only the selected columns.
-- BLOCK select_course_instances_by_course_id
SELECT
  ci.id,
  ci.short_name,
  ci.long_name,
  ci.display_timezone,
  ci.publishing_start_date,
  ci.publishing_end_date
FROM
  course_instances AS ci
WHERE
  ci.course_id = $course_id
  AND ci.deleted_at IS NULL;

-- BLOCK select_assessments_by_course_id
SELECT
  a.id,
  a.course_instance_id,
  ci.short_name AS course_instance_short_name,
  a.tid,
  a.title,
  aset.abbreviation || a.number AS label,
  aset.name AS set_name,
  a.number,
  a.type,
  a.max_points,
  a.max_bonus_points,
  a.multiple_instance,
  a.team_work
FROM
  course_instances AS ci
  JOIN assessments AS a ON (a.course_instance_id = ci.id)
  LEFT JOIN assessment_sets AS aset ON (aset.id = a.assessment_set_id)
WHERE
  ci.course_id = $course_id
  AND ci.deleted_at IS NULL
  AND a.deleted_at IS NULL;

-- BLOCK select_questions_by_course_id
SELECT
  q.id,
  q.qid,
  q.title,
  top.name AS topic,
  q.grading_method,
  q.single_variant,
  q.draft
FROM
  questions AS q
  LEFT JOIN topics AS top ON (top.id = q.topic_id)
WHERE
  q.course_id = $course_id
  AND q.deleted_at IS NULL;

-- BLOCK select_assessment_questions_by_course_id
SELECT
  aq.id,
  a.course_instance_id,
  ci.short_name AS course_instance_short_name,
  aq.assessment_id,
  a.tid AS assessment_tid,
  aq.question_id,
  q.qid,
  aq.number,
  aq.max_points,
  aq.max_auto_points,
  aq.max_manual_points,
  aq.mean_question_score,
  aq.discrimination,
  aq.average_number_submissions
FROM
  course_instances AS ci
  JOIN assessments AS a ON (a.course_instance_id = ci.id)
  JOIN assessment_questions AS aq ON (aq.assessment_id = a.id)
  -- A left join on its primary key, so Postgres skips it unless qid is selected or filtered.
  LEFT JOIN questions AS q ON (q.id = aq.question_id)
WHERE
  ci.course_id = $course_id
  AND ci.deleted_at IS NULL
  AND a.deleted_at IS NULL
  AND aq.deleted_at IS NULL;

-- BLOCK select_assessment_instances_by_course_id
SELECT
  ai.id,
  a.course_instance_id,
  ci.short_name AS course_instance_short_name,
  ai.assessment_id,
  a.tid AS assessment_tid,
  ai.user_id,
  ai.team_id,
  ai.number,
  ai.mode,
  ai.open,
  ai.date AS started_at,
  ai.closed_at,
  EXTRACT(
    EPOCH
    FROM
      ai.duration
  )::double precision AS duration,
  ai.points,
  ai.max_points,
  ai.score_perc,
  ai.include_in_statistics
FROM
  course_instances AS ci
  JOIN assessments AS a ON (a.course_instance_id = ci.id)
  JOIN assessment_instances AS ai ON (ai.assessment_id = a.id)
WHERE
  ci.course_id = $course_id
  AND ci.deleted_at IS NULL
  AND a.deleted_at IS NULL;

-- BLOCK select_instance_questions_by_course_id
SELECT
  iq.id,
  a.course_instance_id,
  ci.short_name AS course_instance_short_name,
  a.id AS assessment_id,
  a.tid AS assessment_tid,
  iq.assessment_instance_id,
  ai.include_in_statistics,
  iq.assessment_question_id,
  aq.question_id,
  q.qid,
  iq.number,
  iq.status,
  iq.points,
  iq.auto_points,
  iq.manual_points,
  iq.score_perc,
  iq.number_attempts,
  iq.highest_submission_score,
  iq.requires_manual_grading,
  EXTRACT(
    EPOCH
    FROM
      iq.duration
  )::double precision AS duration,
  iq.created_at
FROM
  course_instances AS ci
  JOIN assessments AS a ON (a.course_instance_id = ci.id)
  JOIN assessment_instances AS ai ON (ai.assessment_id = a.id)
  JOIN instance_questions AS iq ON (iq.assessment_instance_id = ai.id)
  JOIN assessment_questions AS aq ON (aq.id = iq.assessment_question_id)
  -- A left join on its primary key, so Postgres skips it unless qid is selected or filtered.
  LEFT JOIN questions AS q ON (q.id = aq.question_id)
WHERE
  ci.course_id = $course_id
  AND ci.deleted_at IS NULL
  AND a.deleted_at IS NULL;

-- BLOCK select_variants_by_course_id
SELECT
  v.id,
  a.course_instance_id,
  ci.short_name AS course_instance_short_name,
  a.id AS assessment_id,
  a.tid AS assessment_tid,
  v.instance_question_id,
  v.question_id,
  q.qid,
  v.user_id,
  v.team_id,
  v.number,
  v.date AS created_at,
  v.open,
  v.broken_at IS NOT NULL AS broken,
  v.params,
  v.true_answer
FROM
  course_instances AS ci
  JOIN assessments AS a ON (a.course_instance_id = ci.id)
  JOIN assessment_instances AS ai ON (ai.assessment_id = a.id)
  JOIN instance_questions AS iq ON (iq.assessment_instance_id = ai.id)
  JOIN variants AS v ON (v.instance_question_id = iq.id)
  -- A left join on its primary key, so Postgres skips it unless qid is selected or filtered.
  LEFT JOIN questions AS q ON (q.id = v.question_id)
WHERE
  ci.course_id = $course_id
  AND ci.deleted_at IS NULL
  AND a.deleted_at IS NULL;

-- BLOCK select_submissions_by_course_id
SELECT
  s.id,
  a.course_instance_id,
  ci.short_name AS course_instance_short_name,
  a.id AS assessment_id,
  a.tid AS assessment_tid,
  ai.id AS assessment_instance_id,
  iq.id AS instance_question_id,
  v.question_id,
  q.qid,
  s.variant_id,
  v.user_id,
  v.team_id,
  s.date AS submitted_at,
  s.mode,
  s.gradable,
  s.broken,
  s.graded_at,
  s.score,
  s.correct,
  s.override_score IS NOT NULL AS overridden,
  s.credit,
  -- Uploaded files are base64 file contents, which can be many megabytes.
  s.submitted_answer - '_files' AS submitted_answer,
  s.format_errors,
  s.partial_scores,
  s.feedback
FROM
  course_instances AS ci
  JOIN assessments AS a ON (a.course_instance_id = ci.id)
  JOIN assessment_instances AS ai ON (ai.assessment_id = a.id)
  JOIN instance_questions AS iq ON (iq.assessment_instance_id = ai.id)
  JOIN variants AS v ON (v.instance_question_id = iq.id)
  JOIN submissions AS s ON (s.variant_id = v.id)
  -- A left join on its primary key, so Postgres skips it unless qid is selected or filtered.
  LEFT JOIN questions AS q ON (q.id = v.question_id)
WHERE
  ci.course_id = $course_id
  AND ci.deleted_at IS NULL
  AND a.deleted_at IS NULL;
