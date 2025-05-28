-- BLOCK select_exists_external_image_capture
SELECT 
    EXISTS (
        SELECT 1
        FROM external_image_capture
        WHERE variant_id = $variant_id
          AND answer_name = $answer_name
          AND deleted_at IS NULL    
    );