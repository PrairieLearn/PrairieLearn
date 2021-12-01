-- BLOCK get_barcodes
SELECT *
FROM barcodes;

-- BLOCK get_barcodes_with_submissions
SELECT *
FROM barcodes
WHERE file_id IS NOT NULL;
