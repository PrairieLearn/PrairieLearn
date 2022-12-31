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

-- BLOCK select_rubric_items
WITH rubric_items_data AS (
    SELECT JSONB_AGG(ri) AS items
    FROM rubric_items AS ri
    WHERE
        ri.rubric_id = $rubric_id
        AND ri.id = ANY($rubric_items::BIGINT[])
        AND ri.deleted_at IS NULL
)
SELECT
    TO_JSONB(r) AS rubric_data,
    COALESCE(rid.items, '[]'::JSONB) AS rubric_item_data
FROM
    rubrics r
    LEFT JOIN rubric_items_data rid ON (TRUE)
WHERE
    r.id = $rubric_id
    AND r.deleted_at IS NULL;

-- BLOCK select_assessment_question_for_update
SELECT *
FROM assessment_questions
WHERE id = $assessment_question_id
FOR UPDATE;

-- BLOCK insert_rubric
INSERT INTO rubrics
    (starting_points, min_points, max_points)
VALUES
    ($starting_points, $min_points, $max_points)
RETURNING id;

-- BLOCK update_rubric
UPDATE rubrics
SET
    starting_points = $starting_points,
    min_points = $min_points,
    max_points = $max_points,
    modified_at = CURRENT_TIMESTAMP
WHERE
    id = $rubric_id;

-- BLOCK update_assessment_question_rubric_id
UPDATE assessment_questions
SET
    manual_rubric_id = $manual_rubric_id,
    auto_rubric_id = $auto_rubric_id
WHERE
    id = $assessment_question_id;

-- BLOCK delete_rubric_items
UPDATE rubric_items
SET deleted_at = NOW()
WHERE
    rubric_id = $rubric_id
    AND deleted_at IS NULL
    AND NOT (id = ANY($active_rubric_items::BIGINT[]));

-- BLOCK update_rubric_item
UPDATE rubric_items
SET
    number = $number::bigint,
    points = $points,
    short_text = COALESCE($short_text, short_text),
    description = COALESCE($description, description),
    staff_instructions = COALESCE($staff_instructions, staff_instructions),
    key_binding = CASE WHEN $number > 10 THEN NULL ELSE MOD($number + 1, 10) END,
    deleted_at = NULL
WHERE
    id = $id
    AND rubric_id = $rubric_id
RETURNING id;

-- BLOCK insert_rubric_item
INSERT INTO rubric_items
    (rubric_id, number, points, short_text, description, staff_instructions, key_binding)
VALUES
    ($rubric_id, $number::bigint, $points, $short_text, $description, $staff_instructions,
     CASE WHEN $number > 10 THEN NULL ELSE MOD($number + 1, 10) END);

-- BLOCK select_instance_questions_to_update
WITH rubric_gradings_to_review AS (
    SELECT
        rg.*,
        aq.assessment_id,
        iq.assessment_instance_id,
        iq.id AS instance_question_id,
        rg.starting_points != r.starting_points OR
        rg.max_points != r.max_points OR
        rg.min_points != r.min_points AS rubric_settings_changed
    FROM
        instance_questions AS iq
        JOIN assessment_questions AS aq ON (aq.id = iq.assessment_question_id)
        JOIN rubric_gradings AS rg ON (rg.id = CASE WHEN $rubric_type = 'auto' THEN iq.auto_rubric_grading_id ELSE iq.manual_rubric_grading_id END)
        JOIN rubrics AS r ON (r.id = rg.rubric_id)
    WHERE
        iq.assessment_question_id = $assessment_question_id
),
grading_items_to_review AS (
    SELECT
        rgr.id AS rubric_grading_id,
        JSONB_AGG(rgi) AS applied_rubric_items,
        BOOL_OR(ri.id IS NULL OR ri.points != rgi.points) AS rubric_items_changed
    FROM
        rubric_gradings_to_review AS rgr
        JOIN rubric_grading_items AS rgi ON (rgi.rubric_grading_id = rgr.id)
        LEFT JOIN rubric_items AS ri ON (ri.id = rgi.rubric_item_id AND ri.deleted_at IS NULL)
    GROUP BY rgr.id
)
SELECT
    rgr.*, gir.*
FROM
    rubric_gradings_to_review AS rgr
    LEFT JOIN grading_items_to_review AS gir ON (gir.rubric_grading_id = rgr.id)
WHERE
    rgr.rubric_settings_changed IS TRUE OR gir.rubric_items_changed;

-- BLOCK tag_for_manual_grading
UPDATE instance_questions iq
SET requires_manual_grading = TRUE
WHERE iq.assessment_question_id = $assessment_question_id;

-- BLOCK insert_rubric_grading
WITH inserted_rubric_grading AS (
    INSERT INTO rubric_gradings
        (rubric_id, computed_points, adjust_points, starting_points, max_points, min_points)
    SELECT r.id, $computed_points, $adjust_points, r.starting_points, r.max_points, r.min_points
    FROM rubrics r
    WHERE r.id = $rubric_id
    RETURNING *
), inserted_rubric_grading_items AS (
    INSERT INTO rubric_grading_items
        (rubric_grading_id, rubric_item_id, score, points, short_text, note)
    SELECT
        irg.id, ari.rubric_item_id, COALESCE(ari.score, 1), ri.points, ri.short_text, ari.note
    FROM
        inserted_rubric_grading AS irg
        JOIN JSONB_TO_RECORDSET($rubric_items::JSONB) AS ari(rubric_item_id BIGINT, score DOUBLE PRECISION, note TEXT) ON (TRUE)
        JOIN rubric_items AS ri ON (ri.id = ari.rubric_item_id AND ri.rubric_id = $rubric_id)
    RETURNING *
)
SELECT irg.id
FROM
    inserted_rubric_grading AS irg
    LEFT JOIN inserted_rubric_grading_items AS irgi ON (TRUE)
LIMIT 1;
