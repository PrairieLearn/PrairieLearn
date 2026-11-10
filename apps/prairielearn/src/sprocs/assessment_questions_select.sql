CREATE FUNCTION
    assessment_questions_select (
        IN arg_assessment_id bigint,
        IN arg_existing_assessment_question_ids bigint[]
    ) RETURNS TABLE (
        assessment_question_id bigint
    )
AS $$
WITH
  -- First assign two random orderings to the list of questions, one for
  -- alternative_group question selection and one for zone question
  -- selection. Existing selections keep priority when an instance is updated.
  randomized_assessment_questions AS (
    SELECT
      aq.*,
      CASE
        WHEN aq.id = ANY (arg_existing_assessment_question_ids) THEN 1
        ELSE 2
      END AS existing_order,
      random() AS ag_rand, -- for alternative_group selection
      random() AS z_rand -- for zone selection
    FROM
      assessment_questions AS aq
    WHERE
      aq.assessment_id = arg_assessment_id
      AND aq.deleted_at IS NULL
  ),
  -- Next choose subsets of each alternative_group with the correct
  -- number of questions, or all of them if number_choose isn't
  -- specified for that alternative_group.
  --
  -- To do this, we start by sorting the questions within each
  -- alternative_group by the ag_rand value.
  ag_numbered_assessment_questions AS (
    SELECT
      aq.*,
      (
        row_number() OVER (
          PARTITION BY
            aq.alternative_group_id
          ORDER BY
            aq.existing_order,
            aq.ag_rand,
            aq.id
        )
      ) AS ag_row_number
    FROM
      randomized_assessment_questions AS aq
  ),
  -- Now we actually choose the questions in each alternative_group.
  ag_chosen_assessment_questions AS (
    SELECT
      aq.*
    FROM
      ag_numbered_assessment_questions AS aq
      JOIN alternative_groups AS ag ON (ag.id = aq.alternative_group_id)
    WHERE
      (ag.number_choose IS NULL)
      OR (ag_row_number <= ag.number_choose)
  ),
  -- Next we choose subsets of questions in each zone (or all of them
  -- if number_choose isn't specified for the zone).
  --
  -- We start by sorting the questions within each zone, similarly to
  -- what we did above for each alternative_group. A key difference
  -- is that we first sort by the ag_row_number and then by z_rand.
  -- This means that all the questions with ag_row_number = 1 will be
  -- used up first, then all the ones with ag_row_number = 2, etc.
  -- This has the effect of spreading out our choices among the
  -- different alternative_groups in the zone as much as possible.
  z_numbered_assessment_questions AS (
    SELECT
      aq.*,
      (
        row_number() OVER (
          PARTITION BY
            z.id
          ORDER BY
            aq.ag_row_number,
            aq.existing_order,
            aq.z_rand,
            aq.id
        )
      ) AS z_row_number
    FROM
      ag_chosen_assessment_questions AS aq
      JOIN alternative_groups AS ag ON (ag.id = aq.alternative_group_id)
      JOIN zones AS z ON (z.id = ag.zone_id)
  ),
  -- Now we actually select the questions within the zone.
  z_chosen_assessment_questions AS (
    SELECT
      aq.*
    FROM
      z_numbered_assessment_questions AS aq
      JOIN alternative_groups AS ag ON (ag.id = aq.alternative_group_id)
      JOIN zones AS z ON (z.id = ag.zone_id)
      JOIN questions AS q ON (q.id = aq.question_id)
    WHERE
      (
        z.number_choose IS NULL
        OR z_row_number <= z.number_choose
      )
      AND q.deleted_at IS NULL
  )
SELECT
  aq.id AS assessment_question_id
FROM
  z_chosen_assessment_questions AS aq;
$$ LANGUAGE sql VOLATILE;
