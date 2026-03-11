-- BLOCK select_assessment_by_id
SELECT
  *
FROM
  assessments
WHERE
  id = $assessment_id;

-- BLOCK select_assessment_by_tid
SELECT
  *
FROM
  assessments
WHERE
  tid = $tid
  AND course_instance_id = $course_instance_id
  AND deleted_at IS NULL;

-- BLOCK select_assessment_info_for_job
SELECT
  aset.abbreviation || a.number AS assessment_label,
  ci.id AS course_instance_id,
  c.id AS course_id
FROM
  assessments AS a
  JOIN assessment_sets AS aset ON (aset.id = a.assessment_set_id)
  JOIN course_instances AS ci ON (ci.id = a.course_instance_id)
  JOIN courses AS c ON (c.id = ci.course_id)
WHERE
  a.id = $assessment_id;

-- BLOCK select_assessments_for_course_instance
WITH
  issue_count AS (
    SELECT
      a.id AS assessment_id,
      count(*) AS open_issue_count
    FROM
      assessments AS a
      JOIN issues AS i ON (i.assessment_id = a.id)
    WHERE
      a.course_instance_id = $course_instance_id
      AND i.course_caused
      AND i.open
    GROUP BY
      a.id
  ),
  manual_grading_count AS (
    SELECT
      aq.assessment_id,
      count(*) FILTER (
        WHERE
          iq.requires_manual_grading
      ) AS num_instance_questions_to_grade,
      count(*) AS num_instance_questions_with_manual_grading
    FROM
      assessment_questions AS aq
      JOIN instance_questions AS iq ON (iq.assessment_question_id = aq.id)
    WHERE
      aq.assessment_id IN (
        SELECT
          id
        FROM
          assessments
        WHERE
          course_instance_id = $course_instance_id
          AND deleted_at IS NULL
      )
      AND aq.deleted_at IS NULL
      AND coalesce(aq.max_manual_points, 0) > 0
      AND iq.status != 'unanswered'
    GROUP BY
      aq.assessment_id
  )
SELECT
  a.*,
  EXISTS (
    SELECT
      1
    FROM
      assessment_instances AS ai
    WHERE
      ai.assessment_id = a.id
      AND ai.modified_at > a.statistics_last_updated_at - interval '1 minute'
  ) AS needs_statistics_update,
  (aset.abbreviation || a.number) AS label,
  aset.name,
  to_jsonb(aset) AS assessment_set,
  to_jsonb(am) AS assessment_module,
  (
    LAG(
      CASE
        WHEN ci.assessments_group_by = 'Set' THEN aset.id
        ELSE am.id
      END
    ) OVER (
      PARTITION BY
        (
          CASE
            WHEN ci.assessments_group_by = 'Set' THEN aset.id
            ELSE am.id
          END
        )
      ORDER BY
        aset.number,
        a.order_by,
        a.id
    ) IS NULL
  ) AS start_new_assessment_group,
  coalesce(ic.open_issue_count, 0) AS open_issue_count,
  coalesce(mgc.num_instance_questions_to_grade, 0) AS num_instance_questions_to_grade,
  coalesce(mgc.num_instance_questions_with_manual_grading, 0) AS num_instance_questions_with_manual_grading
FROM
  assessments AS a
  JOIN course_instances AS ci ON (ci.id = a.course_instance_id)
  LEFT JOIN assessment_sets AS aset ON (aset.id = a.assessment_set_id)
  LEFT JOIN issue_count AS ic ON (ic.assessment_id = a.id)
  LEFT JOIN manual_grading_count AS mgc ON (mgc.assessment_id = a.id)
  LEFT JOIN assessment_modules AS am ON (am.id = a.assessment_module_id)
WHERE
  ci.id = $course_instance_id
  AND a.deleted_at IS NULL
ORDER BY
  (
    CASE
      WHEN ci.assessments_group_by = 'Module' THEN am.number
    END
  ),
  (
    CASE
      WHEN ci.assessments_group_by = 'Module' THEN am.id
    END
  ),
  aset.number,
  a.order_by,
  a.id;
