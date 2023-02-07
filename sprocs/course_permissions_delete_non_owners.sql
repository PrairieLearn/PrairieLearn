CREATE FUNCTION
    course_permissions_delete_non_owners(
        course_id bigint,
        authn_user_id bigint
    ) returns void
AS $$
BEGIN
    PERFORM
        course_permissions_delete(cp.course_id, cp.user_id, authn_user_id)
    FROM
        course_permissions AS cp
    WHERE
        cp.course_id = course_permissions_delete_non_owners.course_id
        AND cp.course_role != 'Owner';
END;
$$ LANGUAGE plpgsql VOLATILE;
