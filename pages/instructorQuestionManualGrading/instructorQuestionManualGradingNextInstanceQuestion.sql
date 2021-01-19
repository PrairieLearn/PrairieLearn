-- BLOCK get_unmarked_instance_questions
SELECT iq.* FROM instance_questions AS iq
    LEFT JOIN variants AS v ON (v.instance_question_id = iq.id)
    LEFT JOIN submissions AS s ON (s.variant_id = v.id)
    -- Note that we want WHERE s.graded_at OR where no submission exists so we can manually grade 
    -- non-submissions as 0 or where submissions have been submitted likely as non-0 scores.
WHERE iq.assessment_question_id = $assessment_question_id AND (s.graded_at IS NULL OR s IS NULL);
    