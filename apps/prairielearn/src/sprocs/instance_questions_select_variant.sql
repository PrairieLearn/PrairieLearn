CREATE FUNCTION
    instance_questions_select_variant (
        IN instance_question_id bigint,
        IN require_open boolean,
        OUT variant jsonb
    )
AS $$
BEGIN
    PERFORM instance_questions_lock(instance_question_id);

    SELECT
        jsonb_set(to_jsonb(v.*), '{formatted_date}',
                  to_jsonb(format_date_full_compact(v.date, ci.display_timezone)))
    INTO variant
    FROM variants AS v
    JOIN course_instances AS ci ON (ci.id = v.course_instance_id)
    WHERE
        v.instance_question_id = instance_questions_select_variant.instance_question_id
        AND (NOT require_open OR v.open)
        AND NOT v.broken
    ORDER BY v.date DESC
    LIMIT 1;
END;
$$ LANGUAGE plpgsql VOLATILE;
