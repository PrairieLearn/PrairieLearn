-- BLOCK insert_barcodes
INSERT INTO barcodes(barcode)
VALUES
    $barcodes
RETURNING *;

-- BLOCK get_barcodes_count
LOCK TABLE barcodes IN ACCESS EXCLUSIVE MODE;
SELECT COUNT(id) FROM barcodes;
