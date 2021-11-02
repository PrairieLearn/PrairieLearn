-- BLOCK insert_x_null_barcodes
INSERT INTO barcodes
  (barcode)
SELECT
  NULL
FROM generate_series(1, $num_rows)
RETURNING id;

-- BLOCK update_null_barcodes
