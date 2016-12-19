CREATE OR REPLACE FUNCTION
    exam_question_status (instance_question instance_questions) RETURNS TEXT AS $$
DECLARE
    latest_submission submissions;
BEGIN
    IF NOT instance_question.open THEN
        RETURN 'complete';
    END IF;

    SELECT s.* INTO latest_submission
    FROM
        variants AS v
        JOIN submissions AS s ON (s.variant_id = v.id)
    WHERE
        v.instance_question_id = instance_question.id
    ORDER BY
        s.date DESC
    LIMIT 1;

    IF latest_submission.id IS NULL THEN
        RETURN 'unanswered';
    END IF;

    IF latest_submission.score IS NULL THEN
        RETURN 'saved';
    END IF;

    IF latest_submission.correct THEN
        RETURN 'correct';
    ELSE
        RETURN 'incorrect';
    END IF;
END;
$$ LANGUAGE plpgsql;
