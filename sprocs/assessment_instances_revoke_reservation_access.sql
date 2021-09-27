CREATE FUNCTION
    assessment_instances_revoke_reservation_access(
        IN arg_assessment_instance_id bigint,
        IN arg_authn_user_id bigint
    ) RETURNS VOID
AS $$
BEGIN
    PERFORM 1
    FROM
        assessment_instances AS ai
        JOIN assessment_access_rules AS aar ON (aar.assessment_id = ai.assessment_id AND exam_uuid IS NOT NULL)
        JOIN pt_exams AS x ON (x.uuid = aar.exam_uuid)
        LEFT JOIN groups AS g ON (g.id = ai.group_id)
        LEFT JOIN group_users AS gu ON (gu.group_id = g.id)
        JOIN users AS u ON (u.user_id = ai.user_id OR u.user_id = gu.user_id)
        JOIN pt_enrollments AS e ON (e.user_id = u.user_id)
        JOIN pt_reservations AS r ON (r.enrollment_id = e.id AND r.exam_id = x.id)
        CROSS JOIN LATERAL reservations_student_end_exam(r.id, arg_authn_user_id)
    WHERE
        ai.id = arg_assessment_instance_id
        AND g.deleted_at IS NULL
        AND (now() BETWEEN r.access_start AND r.access_end);
EXCEPTION
-- The function reservations_student_end_exam is only expected to exist if PT integration is in place, if it is not then nothing should be done
WHEN undefined_function THEN RETURN;
END;
$$ LANGUAGE plpgsql VOLATILE;
