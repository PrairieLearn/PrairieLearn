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
