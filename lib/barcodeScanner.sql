-- BLOCK get_barcode_metadata
SELECT
    s.id AS submission_id,
    iq.assessment_instance_id AS assessment_instance_id,
    iq.id AS instance_question_id,
    s.submitted_answer->>'_pl_artifact_barcode' AS barcode,
    f.id AS file_id
FROM 
    submissions AS s
    JOIN variants AS v ON (v.id = s.variant_id)
    LEFT JOIN instance_questions AS iq ON (iq.id = v.instance_question_id)  -- LEFT JOIN HERE SO INSTRUCTOR CAN USE THIS FEATURE TOO
    LEFT JOIN files AS f ON (f.instance_question_id = iq.id)
WHERE $match AND type = 'pdf_artifact_upload';

-- BLOCK update_barcodes
DROP TABLE IF EXISTS barcode_file_ids_temp;

CREATE TEMP TABLE barcode_file_ids_temp
    (file_id BIGINT NOT NULL PRIMARY KEY, barcode TEXT);

INSERT INTO
    barcode_file_ids_temp(file_id, barcode)
VALUES
    $updateValues;

UPDATE
    barcodes b
SET
    file_id = bf.file_id
FROM
    barcode_file_ids_temp bf
WHERE
    b.barcode = bf.barcode
RETURNING b.barcode;

-- BLOCK get_submission_iq_and_ai
SELECT 
    iq.assessment_instance_id AS assessment_instance_id,
    iq.id AS instance_question_id
FROM
    submissions AS s
    JOIN variants AS v ON (v.id = s.variant_id)
    JOIN instance_questions AS iq ON (iq.id = v.instance_question_id)
WHERE s.id = $submissionId;
