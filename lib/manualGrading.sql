-- BLOCK select_next_ungraded_instance_question
WITH prior_instance_question AS (
    SELECT
        iq.*,
        COALESCE(g.name, u.name) AS prior_user_or_group_name
    FROM
        instance_questions AS iq
        LEFT JOIN assessment_instances AS ai ON (ai.id = iq.assessment_instance_id)
        LEFT JOIN users AS u ON (u.user_id = ai.user_id)
        LEFT JOIN groups AS g ON (g.id = ai.group_id)
    WHERE iq.id = $prior_instance_question_id
)
SELECT
    iq.*,
    COALESCE(g.name, u.name) AS user_or_group_name
FROM
    instance_questions AS iq
    JOIN assessment_instances AS ai ON (ai.id = iq.assessment_instance_id)
    LEFT JOIN users AS u ON (u.user_id = ai.user_id)
    LEFT JOIN groups AS g ON (g.id = ai.group_id)
    LEFT JOIN prior_instance_question AS piq ON (TRUE)
WHERE
    iq.assessment_question_id = $assessment_question_id
    AND ai.assessment_id = $assessment_id -- since assessment_question_id is not authz'ed
    AND ($prior_instance_question_id::BIGINT IS NULL OR iq.id != $prior_instance_question_id)
    AND iq.requires_manual_grading
    AND (iq.assigned_grader = $user_id OR iq.assigned_grader IS NULL)
    AND EXISTS(SELECT 1
               FROM variants AS v JOIN submissions AS s ON (s.variant_id = v.id)
               WHERE v.instance_question_id = iq.id)
ORDER BY
    -- Choose one assigned to current user if one exists, unassigned if not
    iq.assigned_grader NULLS LAST,
    -- Choose question that list after the prior if one exists (follow the order in the instance list)
    (COALESCE(g.name, u.name), iq.id) > (piq.prior_user_or_group_name, piq.id) DESC,
    user_or_group_name,
    iq.id
LIMIT 1;

-- BLOCK select_rubric_data
WITH submission_count_per_rubric_item AS (
    SELECT
        rgi.rubric_item_id,
        COUNT(1) AS num_submissions
    FROM
        instance_questions iq
        JOIN rubric_gradings rg ON (rg.id IN (iq.manual_rubric_grading_id, iq.auto_rubric_grading_id))
        JOIN rubric_grading_items rgi ON (rgi.rubric_grading_id = rg.id)
    WHERE
        iq.assessment_question_id = $assessment_question_id
        AND rg.rubric_id = $rubric_id
    GROUP BY rgi.rubric_item_id
), rubric_items_data AS (
    SELECT
        JSONB_AGG(
            JSONB_BUILD_OBJECT(
                'rubric_item', TO_JSONB(ri),
                'grading_item', TO_JSONB(rgi),
                'num_submissions', COALESCE(scpri.num_submissions, 0))
            ORDER BY ri.number, ri.id) AS items_data
    FROM
        rubric_items AS ri
        LEFT JOIN submission_count_per_rubric_item AS scpri ON (scpri.rubric_item_id = ri.id)
        LEFT JOIN rubric_grading_items AS rgi ON (rgi.rubric_item_id = ri.id
                                                  AND rgi.rubric_grading_id = $rubric_grading_id)
    WHERE
        ri.rubric_id = $rubric_id
        AND ri.deleted_at IS NULL
)
SELECT
    TO_JSONB(r) AS rubric_data,
    TO_JSONB(rg) AS rubric_grading_data,
    rid.items_data AS rubric_items
FROM
    rubrics r
    LEFT JOIN rubric_gradings rg ON (rg.id = $rubric_grading_id)
    LEFT JOIN rubric_items_data rid ON (TRUE)
WHERE
    r.id = $rubric_id
    AND r.deleted_at IS NULL;
