-- BLOCK select_file
SELECT f.storage_filename
FROM
    files AS f
WHERE
    f.id = $file_id
    AND f.assessment_instance_id = $assessment_instance_id
    AND f.display_filename = $display_filename
    AND f.deleted_at IS NULL;
