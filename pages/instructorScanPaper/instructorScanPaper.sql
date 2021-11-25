-- BLOCK get_submissions_with_barcodes

SELECT *
FROM submissions
WHERE submitted_answer->>'_pl_artifact_barcode' = $barcodes

-- BLOCK update_barcodes_with_submission

DROP TABLE IF EXISTS barcode_submission_ids_temp;

CREATE TEMP TABLE barcode_submission_ids_temp
    (submission_id INTEGER NOT NULL PRIMARY KEY, barcode TEXT);

INSERT INTO barcode_submission_ids_temp(submission_id, barcode)
VALUES $barcodeSubmissionVals;

UPDATE barcodes b
SET submission_id = bs_temp.submission_id
FROM barcode_submission_ids_temp bs_temp
WHERE b.barcode = bs_temp.barcode
RETURNING *;
