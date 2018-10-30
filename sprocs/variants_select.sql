DROP FUNCTION IF EXISTS variants_select(bigint);
CREATE OR REPLACE FUNCTION
    variants_select (
        IN variant_id bigint,
        OUT variant jsonb
    )
AS $$
BEGIN
    SELECT
        jsonb_set(to_jsonb(v.*), '{formatted_date}',
                  to_jsonb(format_date_full_compact(v.date, COALESCE(ci.display_timezone, c.display_timezone))))
    INTO variant
    FROM variants AS v
    JOIN course_instances AS ci ON (ci.id = v.course_instance_id)
    JOIN pl_courses AS c ON (c.id = ci.course_id)
    WHERE v.id = variants_select.variant_id;

    IF NOT FOUND THEN RAISE EXCEPTION 'no such variant_id: %', variant_id; END IF;
END;
$$ LANGUAGE plpgsql VOLATILE;
