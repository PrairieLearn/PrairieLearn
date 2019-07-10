-- Accepts a course instance ID and a list [uid, role] pairs, ensures that
-- users exist for all uids, and then ensures enrollments and roles are
-- updated.

CREATE OR REPLACE FUNCTION
    sync_course_staff(
        IN course_staff JSONB,
        IN new_course_instance_id bigint
    ) returns void
AS $$
DECLARE
    enrollment JSONB;
    new_user_id bigint;
    new_user_ids bigint[];
BEGIN
    FOR enrollment IN SELECT * FROM JSONB_ARRAY_ELEMENTS(sync_course_staff.course_staff) LOOP
        -- Ensure that a user exists
        INSERT INTO users
                (uid)
        VALUES (enrollment->>0)
        ON CONFLICT (uid) DO UPDATE
        SET uid = users.uid -- re-set uid to force row to be returned
        RETURNING user_id INTO new_user_id;
        new_user_ids := array_append(new_user_ids, new_user_id);

        -- Ensure enrollment for this course instance
        INSERT INTO enrollments
                (user_id,  role,  course_instance_id)
        VALUES (new_user_id, (enrollment->>1)::enum_role, new_course_instance_id)
        ON CONFLICT (user_id, course_instance_id) DO UPDATE
        SET
            role = EXCLUDED.role;
    END LOOP;

    -- Downgrade all other enrollments
    UPDATE enrollments AS e
    SET role = 'Student'
    FROM
        users AS u
    WHERE
        u.user_id = e.user_id
        AND e.course_instance_id = new_course_instance_id
        AND u.user_id NOT IN (SELECT unnest(new_user_ids))
        AND e.role != 'Student';
END;
$$ LANGUAGE plpgsql VOLATILE;
