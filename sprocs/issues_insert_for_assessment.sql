CREATE FUNCTION
    issues_insert_for_assessment(
        assessment_id bigint,
        student_message text,
        instructor_message text,
        course_caused boolean,
        course_data jsonb,
        system_data jsonb,
        user_id bigint,
        authn_user_id bigint
    ) RETURNS void
AS $$
DECLARE
    course_id bigint;
    course_instance_id bigint;
BEGIN
    SELECT
        c.id,      ci.id
    INTO
        course_id, course_instance_id
    FROM
        assessments AS a
        JOIN course_instances AS ci ON (ci.id = a.course_instance_id)
        JOIN pl_courses AS c ON (c.id = ci.course_id)
    WHERE
        a.id = assessment_id;

    IF NOT FOUND THEN RAISE EXCEPTION 'invalid assessment_id'; END IF;

    INSERT INTO issues
        (student_message, instructor_message, course_caused, course_data, system_data, authn_user_id,
        course_id, course_instance_id, assessment_id, user_id)
    VALUES
        (student_message, instructor_message, course_caused, course_data, system_data, authn_user_id,
        course_id, course_instance_id, assessment_id, user_id);
END;
$$ LANGUAGE plpgsql VOLATILE;
