DROP FUNCTION IF EXISTS questions_select_templates(bigint);

-- Returns the IDs of template questions (if any) for the given question_id
-- Recursively finds all templates in the chain

CREATE OR REPLACE FUNCTION
    questions_select_templates (
        IN question_id bigint
    ) RETURNS TABLE (id bigint)
AS $$
WITH RECURSIVE template_questions AS (
    -- non-recursive term that finds the ID of the template question (if any) for question_id
    SELECT tq.*
    FROM
        questions AS q
        JOIN questions AS tq ON (tq.qid = q.template_directory AND tq.course_id = q.course_id)
    WHERE q.id = question_id
    -- required UNION for a recursive WITH statement
    UNION
    -- recursive term that references template_questions again
    SELECT tq.*
    FROM
        template_questions AS q
        JOIN questions AS tq ON (tq.qid = q.template_directory AND tq.course_id = q.course_id)
)
SELECT id FROM template_questions LIMIT 100; -- LIMIT prevents infinite recursion on circular templates
$$ LANGUAGE SQL STABLE;
