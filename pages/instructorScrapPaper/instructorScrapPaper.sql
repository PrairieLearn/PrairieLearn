-- BLOCK get_barcodes_count
LOCK TABLE barcodes IN ACCESS EXCLUSIVE MODE;
SELECT COUNT(id) FROM barcodes;

-- BLOCK insert_x_null_barcodes
-- TO DO: REMOVE ME PROBABLY
INSERT INTO barcodes
  (barcode)
SELECT
  NULL
FROM generate_series(1, $num_rows)
RETURNING id;

-- BLOCK insert_barcodes
INSERT INTO barcodes(barcode)
VALUES
    $barcodes
RETURNING *;
