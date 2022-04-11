CREATE FUNCTION
    course_requests_insert(
        IN user_id bigint,
        IN short_name text,
        IN title text,
        IN github_user text,
        IN first_name text,
        IN last_name text,
        IN work_email text,
        IN institution text,
        OUT auto_created bool,
        OUT course_request_id bigint
    )
AS $$
DECLARE
    status enum_course_request_status;
BEGIN
    -- see if we can automatically create the course
    -- the user needs to have pre-existing edit/owner permissions and not have more than 3 requests in the past 24 hours
    SELECT
        EXISTS (SELECT TRUE FROM course_permissions AS cp
                WHERE cp.user_id = course_requests_insert.user_id AND (cp.course_role = 'Owner' OR cp.course_role = 'Editor'))
        AND NOT EXISTS (SELECT TRUE FROM course_requests AS cr
                WHERE cr.user_id = course_requests_insert.user_id AND cr.approved_status = 'denied')
        AND (count(*) < 3)
    INTO auto_created
    FROM course_requests AS cr
    WHERE cr.user_id = course_requests_insert.user_id AND cr.created_at BETWEEN NOW() - INTERVAL '24 HOURS' AND NOW();

    IF auto_created IS TRUE THEN
        status := 'creating';
    ELSE
        status := 'pending';
    END IF;

    INSERT INTO course_requests(short_name, title, user_id, github_user, first_name, last_name, work_email, institution, approved_status)
    VALUES (course_requests_insert.short_name,
            course_requests_insert.title,
            course_requests_insert.user_id,
            course_requests_insert.github_user,
            course_requests_insert.first_name,
            course_requests_insert.last_name,
            course_requests_insert.work_email,
            course_requests_insert.institution,
            status)
    RETURNING
        course_requests.id INTO course_request_id;
END;
$$ LANGUAGE plpgsql VOLATILE;
