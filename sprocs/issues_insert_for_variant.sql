DROP FUNCTION IF EXISTS issues_insert_for_variant(bigint,text,boolean,jsonb,jsonb,bigint);
DROP FUNCTION IF EXISTS issues_insert_for_variant(bigint,text,boolean,boolean,jsonb,jsonb,bigint);

CREATE OR REPLACE FUNCTION
    issues_insert_for_variant(
        variant_id bigint,
        student_message text,
        instructor_message text,
        manually_reported boolean,
        course_caused boolean,
        course_data jsonb,
        system_data jsonb,
        authn_user_id bigint
    ) RETURNS void
AS $$
DECLARE
    course_id bigint;
    course_instance_id bigint;
    question_id bigint;
    assessment_id bigint;
    instance_question_id bigint;
    user_id bigint;
    display_id text;
BEGIN
    SELECT
        c.id,      ci.id,              q.id,        a.id,                         iq.id, u.user_id
    INTO
        course_id, course_instance_id, question_id, assessment_id, instance_question_id,   user_id
    FROM
        variants AS v
        JOIN questions AS q ON (q.id = v.question_id)
        JOIN pl_courses AS c ON (c.id = q.course_id)
        JOIN users AS u ON (u.user_id = v.user_id)
        LEFT JOIN instance_questions AS iq ON (iq.id = v.instance_question_id)
        LEFT JOIN assessment_questions AS aq ON (aq.id = iq.assessment_question_id)
        LEFT JOIN assessment_instances AS ai ON (ai.id = iq.assessment_instance_id)
        LEFT JOIN assessments AS a ON (a.id = ai.assessment_id)
        LEFT JOIN course_instances AS ci ON (ci.id = a.course_instance_id)
    WHERE
        v.id = variant_id;

    IF NOT FOUND THEN RAISE EXCEPTION 'invalid variant_id'; END IF;

    display_id := issues_generate_display_id();

    INSERT INTO issues
        (display_id, student_message, instructor_message, course_caused, course_data, system_data, authn_user_id,
        instance_question_id, course_id, course_instance_id, question_id, assessment_id, user_id, variant_id,
        manually_reported)
    VALUES
        (display_id, student_message, instructor_message, course_caused, course_data, system_data, authn_user_id,
        instance_question_id, course_id, course_instance_id, question_id, assessment_id, user_id, variant_id,
        manually_reported);
END;
$$ LANGUAGE plpgsql VOLATILE;
