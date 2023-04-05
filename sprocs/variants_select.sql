CREATE FUNCTION
    variants_select (
        IN variant_id bigint,
        IN question_id bigint,
        IN instance_question_id bigint,
        OUT variant jsonb
    )
AS $$
DECLARE
    variant_with_id record;
    course_instance_display_timezone text;
    course_display_timezone text;
BEGIN
    SELECT
        v.*,
        to_jsonb(a.*) AS assessment,
        to_jsonb(ai.*) AS assessment_instance,
        ai.date AS assessment_instance_date
    INTO variant_with_id
    FROM
        variants as v
        LEFT JOIN instance_questions AS iq ON (iq.id = v.instance_question_id)
        LEFT JOIN assessment_instances AS ai ON (ai.id = iq.assessment_instance_id)
        LEFT JOIN assessments AS a ON (a.id = ai.assessment_id)
    WHERE
        v.id = variants_select.variant_id
        AND v.question_id = variants_select.question_id
        -- instance_question_id is null for question preview, so allow any variant of the question
        AND (
            variants_select.instance_question_id IS NULL
            OR v.instance_question_id = variants_select.instance_question_id
        );

    IF NOT FOUND THEN RAISE EXCEPTION 'no such variant_id for this question: %', variant_id; END IF;

    IF variant_with_id.course_instance_id IS NOT NULL THEN
        SELECT ci.display_timezone
        INTO course_instance_display_timezone
        FROM course_instances AS ci
        WHERE ci.id = variant_with_id.course_instance_id;
    END IF;

    SELECT
        c.display_timezone
    INTO
        course_display_timezone
    FROM
        questions AS q
        JOIN pl_courses AS c ON (c.id = q.course_id)
    WHERE
        q.id = variant_with_id.question_id;

    IF variant_with_id.instance_question_id IS NOT NULL THEN
        variant_with_id.assessment_instance := jsonb_set(variant_with_id.assessment_instance,
            '{formatted_date}', to_jsonb(format_date_full_compact(variant_with_id.assessment_instance_date, COALESCE(course_instance_display_timezone, course_display_timezone))));
    END IF;

    variant := jsonb_set(to_jsonb(variant_with_id.*), '{formatted_date}',
                         to_jsonb(format_date_full_compact(variant_with_id.date, COALESCE(course_instance_display_timezone, course_display_timezone))));
END;
$$ LANGUAGE plpgsql VOLATILE;
