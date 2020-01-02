DROP FUNCTION IF EXISTS variants_select(bigint);
CREATE OR REPLACE FUNCTION
    variants_select (
        IN variant_id bigint,
        OUT variant jsonb
    )
AS $$
DECLARE
    variant_with_id record;
    course_instance_display_timezone text;
    course_display_timezone text;
BEGIN
    SELECT v.*
    INTO variant_with_id
    FROM variants as v
    WHERE v.id = variants_select.variant_id;

    IF NOT FOUND THEN RAISE EXCEPTION 'no such variant_id: %', variant_id; END IF;

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

    variant := jsonb_set(to_jsonb(variant_with_id.*), '{formatted_date}',
                         to_jsonb(format_date_full_compact(variant_with_id.date, COALESCE(course_instance_display_timezone, course_display_timezone))));
END;
$$ LANGUAGE plpgsql VOLATILE;
