-- BLOCK select_questions_manual_grading
WITH
  instance_questions_with_submission AS (
    SELECT
      iq.assessment_question_id,
      COUNT(1) FILTER (
        WHERE
          iq.requires_manual_grading
      ) AS num_instance_questions_to_grade,
      COUNT(1) FILTER (
        WHERE
          iq.requires_manual_grading
          AND iq.assigned_grader = $user_id
      ) AS num_instance_questions_assigned,
      COUNT(1) FILTER (
        WHERE
          iq.requires_manual_grading
          AND iq.assigned_grader IS NULL
      ) AS num_instance_questions_unassigned,
      COUNT(1) AS num_instance_questions,
      JSONB_AGG(
        DISTINCT jsonb_build_object(
          'user_id',
          agu.user_id,
          'name',
          agu.name,
          'uid',
          agu.uid
        )
      ) FILTER (
        WHERE
          iq.requires_manual_grading
          AND iq.assigned_grader IS NOT NULL
      ) AS assigned_graders,
      JSONB_AGG(
        DISTINCT jsonb_build_object(
          'user_id',
          lgu.user_id,
          'name',
          lgu.name,
          'uid',
          lgu.uid
        )
      ) FILTER (
        WHERE
          iq.last_grader IS NOT NULL
      ) AS actual_graders
    FROM
      assessment_questions aq
      JOIN instance_questions iq ON (iq.assessment_question_id = aq.id)
      LEFT JOIN users agu ON (agu.user_id = iq.assigned_grader)
      LEFT JOIN users lgu ON (lgu.user_id = iq.last_grader)
    WHERE
      aq.assessment_id = $assessment_id
      AND iq.status != 'unanswered'
    GROUP BY
      iq.assessment_question_id
  ),
  open_instances AS (
    SELECT
      COUNT(1) num_open_instances
    FROM
      assessment_instances ai
    WHERE
      ai.assessment_id = $assessment_id
      AND ai.open
  )
SELECT
  aq.*,
  q.qid,
  q.title,
  q.id AS question_id,
  admin_assessment_question_number (aq.id) as number,
  ag.number AS alternative_group_number,
  (
    count(*) OVER (
      PARTITION BY
        ag.number
    )
  ) AS alternative_group_size,
  iqs.num_instance_questions,
  iqs.num_instance_questions_to_grade,
  iqs.num_instance_questions_assigned,
  iqs.num_instance_questions_unassigned,
  iqs.assigned_graders,
  iqs.actual_graders,
  oi.num_open_instances
FROM
  assessment_questions AS aq
  JOIN questions AS q ON (q.id = aq.question_id)
  JOIN alternative_groups AS ag ON (ag.id = aq.alternative_group_id)
  LEFT JOIN instance_questions_with_submission iqs ON (iqs.assessment_question_id = aq.id)
  LEFT JOIN open_instances oi ON (TRUE)
WHERE
  aq.assessment_id = $assessment_id
  AND aq.deleted_at IS NULL
  AND q.deleted_at IS NULL
ORDER BY
  aq.number;

-- BLOCK count_instance_questions_to_grade
SELECT
  COUNT(*)::INTEGER
FROM
  instance_questions AS iq
  JOIN assessment_questions AS aq ON (aq.id = iq.assessment_question_id)
WHERE
  iq.assessment_question_id = $unsafe_assessment_question_id
  AND aq.assessment_id = $assessment_id
  AND iq.requires_manual_grading
  AND iq.assigned_grader IS NULL
  AND iq.status != 'unanswered';

-- BLOCK update_instance_question_graders
UPDATE instance_questions
SET
  assigned_grader = $assigned_grader
WHERE
  id IN (
    SELECT
      iq.id
    FROM
      instance_questions AS iq
      JOIN assessment_questions AS aq ON (aq.id = iq.assessment_question_id)
    WHERE
      iq.assessment_question_id = $unsafe_assessment_question_id
      AND aq.assessment_id = $assessment_id
      AND iq.requires_manual_grading
      AND iq.assigned_grader IS NULL
      AND iq.status != 'unanswered'
    ORDER BY
      RANDOM(),
      iq.id
    LIMIT
      $limit
  );

-- BLOCK select_instance_questions_manual_grading
WITH
  issue_count AS (
    SELECT
      i.instance_question_id AS instance_question_id,
      count(*)::integer AS open_issue_count
    FROM
      issues AS i
    WHERE
      i.assessment_id = $assessment_id
      AND i.course_caused
      AND i.open
    GROUP BY
      i.instance_question_id
  )
SELECT
  iq.*,
  -- Convert modified_at to a text representation suitable for
  -- PostgreSQL so it can be properly interpreted when a grade
  -- update POST is received back.
  CAST(iq.modified_at AS TEXT) AS modified_at,
  ai.open AS assessment_open,
  COALESCE(u.uid, array_to_string(gul.uid_list, ', ')) AS uid,
  COALESCE(agu.name, agu.uid) AS assigned_grader_name,
  COALESCE(lgu.name, lgu.uid) AS last_grader_name,
  to_jsonb(aq.*) AS assessment_question,
  COALESCE(g.name, u.name) AS user_or_group_name,
  ic.open_issue_count,
  -- Pseudo-random deterministic stable order of instance questions. This will
  -- always return the same set of instance questions in the same order, but it
  -- is designed to reduce the impact of the order of the instance questions on
  -- individual students, which reduces bias. See
  -- https://papers.ssrn.com/sol3/papers.cfm?abstract_id=4603146
  ((iq.id % 21317) * 45989) % 3767 as iq_stable_order
FROM
  instance_questions AS iq
  JOIN assessment_instances AS ai ON (ai.id = iq.assessment_instance_id)
  JOIN assessment_questions AS aq ON (aq.id = iq.assessment_question_id)
  LEFT JOIN users AS u ON (u.user_id = ai.user_id)
  LEFT JOIN groups AS g ON (g.id = ai.group_id)
  LEFT JOIN groups_uid_list (g.id) AS gul ON TRUE
  LEFT JOIN users AS agu ON (agu.user_id = iq.assigned_grader)
  LEFT JOIN users AS lgu ON (lgu.user_id = iq.last_grader)
  LEFT JOIN issue_count AS ic ON (ic.instance_question_id = iq.id)
WHERE
  ai.assessment_id = $assessment_id
  AND iq.assessment_question_id = $assessment_question_id
  AND iq.status != 'unanswered'
ORDER BY
  iq_stable_order,
  iq.id;
