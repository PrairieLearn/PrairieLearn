DROP FUNCTION IF EXISTS get_total_score(BIGINT, BIGINT[]);
CREATE OR REPLACE FUNCTION get_total_score(user_id_var BIGINT, assessment_question_ids BIGINT[])
    RETURNS double precision
LANGUAGE plpgsql
AS $$
DECLARE
    question_ids BIGINT[];
BEGIN
    SELECT
        array_agg(aq.question_id)
    FROM
        assessment_questions AS aq
    WHERE
        aq.id = ANY(assessment_question_ids)
    INTO
        question_ids;

    RAISE NOTICE '%', question_ids;

    RETURN get_total_score_question_ids(user_id_var, question_ids);
END
$$;

DROP FUNCTION IF EXISTS get_total_score_within_specific_assessment(BIGINT, BIGINT[], BIGINT);
CREATE OR REPLACE FUNCTION get_total_score_within_specific_assessment(
    user_id_var BIGINT,
    assessment_question_ids BIGINT[],
    assessment_id BIGINT
) RETURNS DOUBLE PRECISION
LANGUAGE plpgsql
AS $$
DECLARE
    question_ids BIGINT[];
BEGIN
    SELECT
        array_agg(aq.question_id)
    FROM
        assessment_questions AS aq
    WHERE
        aq.id = ANY(assessment_question_ids)
    INTO
        question_ids;

    RETURN get_total_score_for_question_ids_within_specific_assessment(user_id_var, question_ids, assessment_id);
END
$$;

DROP FUNCTION IF EXISTS to_question_ids(BIGINT[]);
CREATE FUNCTION to_question_ids(
    assessment_question_ids BIGINT[]
) RETURNS BIGINT[]
LANGUAGE PLPGSQL
AS $$
DECLARE
    question_ids BIGINT[];
BEGIN
    SELECT
        array_agg(aq.question_id)
    FROM
        assessment_questions AS aq
    WHERE
        aq.id = ANY(assessment_question_ids)
    INTO
        question_ids;

    RETURN question_ids;
END;
$$;

DROP FUNCTION IF EXISTS get_total_score_question_ids(BIGINT, BIGINT[]);
CREATE FUNCTION get_total_score_question_ids(user_id_var BIGINT, question_ids BIGINT[])
    RETURNS DOUBLE PRECISION
LANGUAGE plpgsql
AS $$
DECLARE
    result DOUBLE PRECISION;
BEGIN
    SELECT
        sum(iq.points) / sum(aq.max_points)
    FROM
        instance_questions AS iq
        JOIN assessment_instances AS ai ON (iq.assessment_instance_id = ai.id)
        JOIN assessment_questions AS aq ON (iq.assessment_question_id = aq.id)
    WHERE
        ai.user_id = user_id_var
        AND aq.question_id = ANY(question_ids)
    INTO
        result;

    RETURN result;
END
$$;

DROP FUNCTION IF EXISTS get_assessment_questions(BIGINT[], BIGINT);
CREATE FUNCTION get_assessment_questions(
    question_ids BIGINT[],
    course_instance_id_var BIGINT
) RETURNS BIGINT[]
LANGUAGE plpgsql
AS $$
DECLARE
    result BIGINT[];
BEGIN
    SELECT
        array_agg(aq.id)
    FROM
        assessment_questions AS aq
        JOIN assessments AS a ON (aq.assessment_id = a.id)
    WHERE
        aq.question_id = ANY(question_ids)
        AND a.course_instance_id = course_instance_id_var
        AND a.tid != 'custom_quiz'
    INTO
        result;

    RETURN result;
END
$$;

DROP FUNCTION IF EXISTS get_assessment_questions_within_assessment(BIGINT[], BIGINT);
CREATE FUNCTION get_assessment_questions_within_assessment(
    question_ids BIGINT[],
    assessment_id_var BIGINT
) RETURNS BIGINT[]
LANGUAGE plpgsql
AS $$
DECLARE
    result BIGINT[];
BEGIN
    SELECT
        array_agg(aq.id)
    FROM
        assessment_questions AS aq
        JOIN assessments AS a ON (aq.assessment_id = a.id)
    WHERE
        aq.question_id = ANY(question_ids)
        AND a.id = assessment_id_var
    INTO
        result;

    RETURN result;
END
$$;

DROP FUNCTION IF EXISTS get_total_score_question_ids(BIGINT, BIGINT[], BIGINT);
CREATE FUNCTION get_total_score_question_ids(
    user_id_var BIGINT,
    question_ids BIGINT[],
    course_instance_id BIGINT
) RETURNS double precision
LANGUAGE plpgsql
AS $$
DECLARE
    assessment_question_ids BIGINT[];
BEGIN
    assessment_question_ids = get_assessment_questions(question_ids, course_instance_id);
    RAISE NOTICE '%', assessment_question_ids;
    RETURN get_total_score(user_id_var, assessment_question_ids);
END
$$;

DROP FUNCTION IF EXISTS get_score(BIGINT, BIGINT, BIGINT);
CREATE FUNCTION get_score(user_id_var BIGINT, question_id_var BIGINT, course_instance_id_var BIGINT)
    RETURNS DOUBLE PRECISION
LANGUAGE plpgsql
AS $$
DECLARE
    result DOUBLE PRECISION;
BEGIN
    SELECT
        sum(iq.points) / sum(aq.max_points)
    FROM
        instance_questions AS iq
        JOIN assessment_instances AS ai ON (iq.assessment_instance_id = ai.id)
        JOIN assessment_questions AS aq ON (iq.assessment_question_id = aq.id)
        JOIN assessments AS a ON (ai.assessment_id = a.id)
    WHERE
        ai.user_id = user_id_var
        AND aq.question_id = question_id_var
        AND a.course_instance_id = course_instance_id_var
    INTO
        result;

    RETURN result;
END
$$;

DROP FUNCTION IF EXISTS get_total_score_for_question_ids_within_specific_assessment(BIGINT, BIGINT[], BIGINT);
CREATE FUNCTION get_total_score_for_question_ids_within_specific_assessment(
    user_id_var BIGINT,
    question_ids BIGINT[],
    assessment_id BIGINT
) RETURNS double precision
LANGUAGE plpgsql
AS $$
DECLARE
    assessment_question_ids BIGINT[];
BEGIN
    assessment_question_ids = get_assessment_questions_within_assessment(question_ids, assessment_id);
    RAISE NOTICE '%', assessment_question_ids;
    RETURN get_total_score(user_id_var, assessment_question_ids);
END
$$;
