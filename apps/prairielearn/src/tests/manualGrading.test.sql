-- BLOCK get_instance_question
SELECT
  *
FROM
  instance_questions
WHERE
  id = $iqId;

-- BLOCK get_assessment_instance_for_iq
SELECT
  ai.*
FROM
  assessment_instances AS ai
  JOIN instance_questions AS iq ON (iq.assessment_instance_id = ai.id)
WHERE
  iq.id = $iqId;

-- BLOCK get_expected_score_perc_pending_for_iq
WITH
  ai AS (
    SELECT
      ai.id,
      ai.max_points
    FROM
      assessment_instances AS ai
      JOIN instance_questions AS iq ON (iq.assessment_instance_id = ai.id)
    WHERE
      iq.id = $iqId
  ),
  tpz AS (SELECT * FROM assessment_instances_points((SELECT id FROM ai))),
  used_iq AS (
    SELECT
      tpz.zid,
      unnest(tpz.max_iq_ids) AS iq_id
    FROM tpz
  ),
  pending_by_zone AS (
    SELECT
      u.zid,
      CASE
        WHEN z.max_points IS NULL THEN
          sum(
            CASE
              WHEN coalesce(aq.max_manual_points, 0) > 0
              AND iq.requires_manual_grading THEN coalesce(aq.max_manual_points, 0)
              ELSE 0
            END
          )
        ELSE
          LEAST(
            sum(
              CASE
                WHEN coalesce(aq.max_manual_points, 0) > 0
                AND iq.requires_manual_grading THEN coalesce(aq.max_manual_points, 0)
                ELSE 0
              END
            ),
            z.max_points
          )
      END AS pending_points
    FROM
      used_iq AS u
      JOIN zones AS z ON (z.id = u.zid)
      LEFT JOIN instance_questions AS iq ON (iq.id = u.iq_id)
      LEFT JOIN assessment_questions AS aq ON (aq.id = iq.assessment_question_id)
    GROUP BY
      u.zid,
      z.max_points
  ),
  pending AS (
    SELECT
      coalesce(sum(pending_points), 0) AS pending_points
    FROM pending_by_zone
  )
SELECT
  CASE
    WHEN (SELECT max_points FROM ai) IS NULL OR (SELECT max_points FROM ai) <= 0 THEN 0
    ELSE LEAST(100, GREATEST(0, (pending.pending_points / (SELECT max_points FROM ai)) * 100))
  END AS expected_score_perc_pending
FROM
  pending;
