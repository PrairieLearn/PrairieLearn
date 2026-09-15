-- BLOCK create_nullable_encrypted_values
CREATE TABLE database_encryption_rotation_nullable_test (id bigserial PRIMARY KEY, encrypted_value text);

-- BLOCK insert_nullable_encrypted_values
INSERT INTO
  database_encryption_rotation_nullable_test (encrypted_value)
VALUES
  (NULL),
  ($current_ciphertext),
  ($fallback_ciphertext);

-- BLOCK select_nullable_encrypted_values
SELECT
  id,
  encrypted_value
FROM
  database_encryption_rotation_nullable_test
ORDER BY
  id;
