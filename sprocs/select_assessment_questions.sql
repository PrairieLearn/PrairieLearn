CREATE FUNCTION
    select_assessment_questions(
        assessment_id bigint,
        assessment_instance_id bigint DEFAULT NULL -- if provided, an existing assessment instance
    ) RETURNS TABLE (
        assessment_question_id bigint,
        init_points double precision,
        points_list double precision[],
        question JSONB
    )
AS $$
WITH
-- First assign two random orderings to the list of questions, one for
-- alternative_group question selection and one for zone question
-- selection, plus a fixed ordering based on the existing question
-- number (if any).
randomized_assessment_questions AS (
    SELECT
        aq.*,
        CASE WHEN iq.id IS NOT NULL THEN 1 ELSE 2 END AS existing_order,
        random() AS ag_rand, -- for alternative_group selection
        random() AS z_rand -- for zone selection
    FROM
        assessment_questions AS aq
        LEFT JOIN ( -- existing questions if they exist
            SELECT * FROM instance_questions
            WHERE assessment_instance_id IS NOT DISTINCT FROM select_assessment_questions.assessment_instance_id
        ) AS iq ON (iq.assessment_question_id = aq.id)
    WHERE
        aq.assessment_id = select_assessment_questions.assessment_id
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
        (row_number() OVER (PARTITION BY aq.alternative_group_id ORDER BY aq.existing_order, aq.ag_rand, aq.id)) AS ag_row_number
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
        (row_number() OVER (PARTITION BY z.id ORDER BY aq.ag_row_number, aq.existing_order, aq.z_rand, aq.id)) AS z_row_number
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
    WHERE
        (z.number_choose IS NULL)
        OR (z_row_number <= z.number_choose)
)
-- Finally format the data for easy question creation.
SELECT
    aq.id,
    aq.init_points,
    aq.points_list,
    to_jsonb(q) AS question
FROM
    z_chosen_assessment_questions AS aq
    JOIN questions AS q ON (q.id = aq.question_id)
WHERE
    q.deleted_at IS NULL;
$$ LANGUAGE SQL VOLATILE;
