# `@prairielearn/encrypted-storage`

Utilities for application-level encryption of values stored in a database. The current format is a versioned AES-256-GCM envelope containing a non-secret key identifier.

The first configured key encrypts new values. All configured keys can decrypt values, and built-in legacy codecs allow existing PrairieLearn and PrairieTest production ciphertext to be read and rotated into the current format. Supplying a legacy codec defaults writes to that legacy format so a rolling deployment cannot accidentally produce ciphertext that old readers do not understand. Applications must explicitly set `writeFormat: 'v1'` after every reader supports the envelope.

```ts
import {
  createPostgresEncryptedValueTarget,
  createStorageCipher,
  legacyPrairieLearnFormat,
} from '@prairielearn/encrypted-storage';

const cipher = createStorageCipher({
  keyRing: [newKey, oldKey],
  legacyFormat: legacyPrairieLearnFormat,
  writeFormat: 'v1',
});

const ciphertext = cipher.encrypt('secret');
const plaintext = cipher.decrypt(ciphertext);
const rotated = cipher.rotate(oldCiphertext);
```

The current wire format is `plenc:v1:<key-id>:<payload>`. The key ID is the first 16 bytes of SHA-256 over the raw key, encoded as unpadded base64url. The payload is the unpadded base64url encoding of a 12-byte IV, followed by the ciphertext and a 16-byte authentication tag. AES-GCM is used without additional authenticated data.

## Postgres targets

Applications using `@prairielearn/postgres` can create a rotation target for the common case of one ciphertext column and one single-column primary key:

```ts
const target = createPostgresEncryptedValueTarget({
  tableName: 'example_credentials',
  primaryKeyColumnName: 'id',
  ciphertextColumnName: 'encrypted_secret',
});
```

Before reading any rows, the target verifies that the configured cursor is the table's single-column primary key. It escapes every identifier, parameterizes every value, reads bounded batches in primary-key order, and uses compare-and-swap updates so concurrent writes are not overwritten. Tables requiring joins, filters, or composite primary keys can implement `EncryptedValueTarget` directly.

## Rotation tooling

`inspectEncryptedValues()` and `rotateEncryptedValues()` provide bounded, idempotent traversal over an application-provided target. `runEncryptedValueOperation()` is the higher-level entry point for operator tooling; it refuses to rotate while the cipher is configured for legacy writes and refuses to report success unless the final verification scan is clean. Applications provide either a Postgres table/column description or a custom target, along with their key/config access and database-backed lock.

Applications should run rotation only after every reader supports the current envelope and every writer uses both the new primary key and the current envelope. The package can verify the cipher configuration in the current process, but it cannot prove that other deployed writers use the same configuration or prevent them from writing while verification runs. The shared package contains the staged-write, legacy-format, retry, and final-verification behavior used by both PrairieLearn and PrairieTest integrations.
