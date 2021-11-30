-- BLOCK get_barcode_metadata
SELECT
    s.id AS submission_id,
    iq.assessment_instance_id AS assessment_instance_id,
    iq.id AS instance_question_id,
    s.submitted_answer->>'_pl_artifact_barcode' AS barcode
FROM 
    submissions AS s
    JOIN variants AS v ON (v.id = s.variant_id)
    JOIN instance_questions AS iq ON (iq.id = v.instance_question_id)
WHERE $match;

-- BLOCK update_barcodes_with_submission
DROP TABLE IF EXISTS barcode_submission_ids_temp;

CREATE TEMP TABLE barcode_submission_ids_temp
    (submission_id BIGINT NOT NULL PRIMARY KEY, barcode TEXT);

INSERT INTO
    barcode_submission_ids_temp(submission_id, barcode)
VALUES
    $updateValues;

UPDATE
    barcodes b
SET
    submission_id = bs_temp.submission_id
FROM
    barcode_submission_ids_temp bs_temp
WHERE
    b.barcode = bs_temp.barcode
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


