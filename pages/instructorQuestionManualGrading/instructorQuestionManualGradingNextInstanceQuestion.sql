-- BLOCK get_and_set_next_unmarked_instance_question_for_manual_grading
UPDATE instance_questions
SET manual_grading_started_at = NOW()
WHERE id = (
    SELECT iq.id
    FROM 
        instance_questions AS iq
            JOIN assessment_questions AS aq ON (aq.id = iq.assessment_question_id)
            JOIN assessments AS a ON (a.id = aq.assessment_id)
            JOIN variants AS v ON (v.instance_question_id = iq.id)
            JOIN (
                -- We only want the LAST submissions that are created by each user to join on all
                -- instance questions under assessment question
                SELECT DISTINCT ON (s.auth_user_id) * FROM submissions AS s
                WHERE s.graded_at IS NULL
                ORDER BY s.auth_user_id, s.date DESC, s.id DESC
            ) s ON (s.variant_id = v.id)
    WHERE 
        iq.assessment_question_id = $assessment_question_id
        -- If previously accessed for manual grading, do not access again for 'manual_grading_lock_time' to prevent TAs overlapping
        AND (iq.manual_grading_started_at IS NULL OR ('now'::time - iq.manual_grading_started_at::time) > $manual_grading_lock_time * '1 second'::interval)
        AND a.id = $assessment_id
    ORDER BY RANDOM()
    LIMIT 1
)
RETURNING *;
