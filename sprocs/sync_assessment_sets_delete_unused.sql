CREATE OR REPLACE FUNCTION
    sync_assessment_sets_delete_unused(
        IN used_assessment_set_ids bigint[],
        IN new_course_id bigint
    ) returns void
AS $$
BEGIN
    DELETE FROM assessment_sets AS aset
    WHERE
        aset.course_id = new_course_id
        AND aset.id NOT IN (SELECT unnest(used_assessment_set_ids));
END;
$$ LANGUAGE plpgsql VOLATILE;
