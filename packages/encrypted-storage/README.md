# `@prairielearn/encrypted-storage`

Utilities for application-level encryption of values stored in a database. Applications provide their ciphertext format so existing PrairieLearn and PrairieTest data remains compatible.

The first configured key encrypts new values. Decryption tries every configured key in order, and values encrypted with a fallback key can be re-encrypted with the primary key.

```ts
import { createStorageCipher, prairieLearnCiphertextFormat } from '@prairielearn/encrypted-storage';

const cipher = createStorageCipher({
  keyRing: [newKey, oldKey],
  format: prairieLearnCiphertextFormat,
});

const ciphertext = cipher.encrypt('secret');
const plaintext = cipher.decrypt(ciphertext);
const replacement = cipher.rotate(oldCiphertext);
```

`prairieLearnCiphertextFormat` uses `base64(12-byte IV + ciphertext + 16-byte authentication tag)`. `prairieTestCiphertextFormat` uses `hex(ciphertext):hex(16-byte IV):hex(16-byte authentication tag)`. Both use AES-256-GCM without additional authenticated data.

## Postgres rotation

Applications using `@prairielearn/postgres` can inspect or rotate a ciphertext column with a single-column primary key:

```ts
import { runPostgresEncryptedColumnOperation } from '@prairielearn/encrypted-storage';

const result = await runPostgresEncryptedColumnOperation({
  mode: 'rotate',
  cipher,
  tableName: 'example_credentials',
  primaryKeyColumnName: 'id',
  ciphertextColumnName: 'encrypted_secret',
});
```

The operation validates the primary key, escapes every identifier, parameterizes every value, reads bounded batches in primary-key order, and uses compare-and-swap updates so concurrent writes are not overwritten. Rotation retries conflicts and refuses to report success unless a final scan authenticates every value with the primary key.

Applications should use a database-backed lock to serialize rotation commands. The shared operation cannot inspect the configuration of other deployed writers or prevent ordinary writes, so operators must ensure every writer uses the new primary key before rotation. Keep the fallback key configured until rotation and verification are complete.
