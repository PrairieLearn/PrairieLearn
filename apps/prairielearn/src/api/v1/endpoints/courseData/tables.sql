-- Each block returns exactly the columns of its table's schema in tables.ts, limited to the course
-- in $course_id. The router wraps a block as a subquery to apply filters, so joins should follow
-- indexed paths down from course_instances.
-- BLOCK course_instances
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

-- BLOCK assessments
SELECT
  a.id,
  a.course_instance_id,
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

-- BLOCK questions
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

-- BLOCK assessment_questions
SELECT
  aq.id,
  a.course_instance_id,
  aq.assessment_id,
  aq.question_id,
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
WHERE
  ci.course_id = $course_id
  AND ci.deleted_at IS NULL
  AND a.deleted_at IS NULL
  AND aq.deleted_at IS NULL;

-- BLOCK assessment_instances
SELECT
  ai.id,
  a.course_instance_id,
  ai.assessment_id,
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

-- BLOCK instance_questions
SELECT
  iq.id,
  a.course_instance_id,
  a.id AS assessment_id,
  iq.assessment_instance_id,
  iq.assessment_question_id,
  aq.question_id,
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
WHERE
  ci.course_id = $course_id
  AND ci.deleted_at IS NULL
  AND a.deleted_at IS NULL;

-- BLOCK variants
SELECT
  v.id,
  a.course_instance_id,
  a.id AS assessment_id,
  v.instance_question_id,
  v.question_id,
  v.user_id,
  v.team_id,
  v.number,
  v.date AS created_at,
  v.open,
  v.broken_at IS NOT NULL AS broken
FROM
  course_instances AS ci
  JOIN assessments AS a ON (a.course_instance_id = ci.id)
  JOIN assessment_instances AS ai ON (ai.assessment_id = a.id)
  JOIN instance_questions AS iq ON (iq.assessment_instance_id = ai.id)
  JOIN variants AS v ON (v.instance_question_id = iq.id)
WHERE
  ci.course_id = $course_id
  AND ci.deleted_at IS NULL
  AND a.deleted_at IS NULL;

-- BLOCK submissions
SELECT
  s.id,
  a.course_instance_id,
  a.id AS assessment_id,
  ai.id AS assessment_instance_id,
  iq.id AS instance_question_id,
  v.question_id,
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
  s.credit
FROM
  course_instances AS ci
  JOIN assessments AS a ON (a.course_instance_id = ci.id)
  JOIN assessment_instances AS ai ON (ai.assessment_id = a.id)
  JOIN instance_questions AS iq ON (iq.assessment_instance_id = ai.id)
  JOIN variants AS v ON (v.instance_question_id = iq.id)
  JOIN submissions AS s ON (s.variant_id = v.id)
WHERE
  ci.course_id = $course_id
  AND ci.deleted_at IS NULL
  AND a.deleted_at IS NULL;
