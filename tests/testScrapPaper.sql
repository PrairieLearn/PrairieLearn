-- BLOCK get_barcodes
SELECT *
FROM barcodes;

-- BLOCK get_barcodes_with_submissions
SELECT *
FROM barcodes
WHERE submission_id IS NOT NULL;
