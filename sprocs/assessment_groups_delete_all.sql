CREATE OR REPLACE FUNCTION
    assessment_groups_delete_all(
        assessment_id bigint,
        authn_user_id bigint
    ) returns void
AS $$
BEGIN
    INSERT INTO temp
    SELECT gr.id
    FROM group_type AS gt
    JOIN groups AS gr ON gr.group_type_id = gt.id
    WHERE gt.assessment_id = assessment_groups_delete_all.assessment_id;

    DELETE FROM group_user gu
    WHERE gu.group_id IN (SELECT id FROM temp);

    DELETE FROM groups g
    WHERE g.id IN (SELECT id FROM temp);
END;
$$ LANGUAGE plpgsql VOLATILE;
