CREATE OR REPLACE FUNCTION
    submissions_insert(
        IN instance_question_id bigint,
        IN authn_user_id bigint,
        IN submitted_answer jsonb,
        IN type enum_submission_type,
        IN credit integer,
        IN mode enum_mode,
        IN variant_id bigint DEFAULT NULL,
        OUT submission_id bigint
    )
AS $$
DECLARE
    variant variants%rowtype;
BEGIN
    IF variant_id IS NULL THEN
        SELECT v.*
        INTO variant
        FROM variants AS v
        WHERE v.instance_question_id = submissions_insert.instance_question_id
        ORDER BY v.date DESC
        LIMIT 1;

        IF NOT FOUND THEN RAISE EXCEPTION 'variant not found'; END IF;

        variant_id := variant.id;
    ELSE
        SELECT * INTO variant FROM variants WHERE id = variant_id;
        IF NOT FOUND THEN RAISE EXCEPTION 'variant not found'; END IF;
    END IF;

    IF variant.instance_question_id != instance_question_id THEN
        RAISE EXCEPTION 'instance_question_id mismatch';
    END IF;

    IF NOT variant.available THEN
        RAISE EXCEPTION 'variant is not available';
    END IF;

    INSERT INTO submissions
            (variant_id, auth_user_id,  submitted_answer, type, credit, mode)
    VALUES  (variant_id, authn_user_id, submitted_answer, type, credit, mode)
    RETURNING id
    INTO submission_id;

    UPDATE instance_questions AS iq
    SET status = 'saved'
    FROM variants AS v
    WHERE
        iq.id = v.instance_question_id
        AND v.id = variant_id;
END;
$$ LANGUAGE plpgsql VOLATILE;
