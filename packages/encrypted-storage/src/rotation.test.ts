import * as crypto from 'node:crypto';

import { assert, describe, expect, it } from 'vitest';

import { createStorageCipher } from './cipher.js';
import { legacyPrairieLearnFormat } from './legacy.js';
import {
  inspectEncryptedValues,
  rotateEncryptedValues,
  runEncryptedValueOperation,
} from './rotation.js';

function makeKey() {
  return crypto.randomBytes(32).toString('hex');
}

function makeTarget(rows: Map<number, string>, conflictOnce = new Set<number>()) {
  return {
    name: 'examples.encrypted_value',
    async selectBatch({ after, limit }: { after: number | null; limit: number }) {
      return [...rows.entries()]
        .filter(([id]) => after == null || id > after)
        .sort(([a], [b]) => a - b)
        .slice(0, limit)
        .map(([cursor, ciphertext]) => ({ cursor, ciphertext }));
    },
    async replaceIfUnchanged({
      cursor,
      expectedCiphertext,
      replacementCiphertext,
    }: {
      cursor: number;
      expectedCiphertext: string;
      replacementCiphertext: string;
    }) {
      if (conflictOnce.delete(cursor)) return false;
      if (rows.get(cursor) !== expectedCiphertext) return false;
      rows.set(cursor, replacementCiphertext);
      return true;
    },
  };
}

describe('encrypted value rotation', () => {
  it('inspects values in bounded batches', async () => {
    const primaryKey = makeKey();
    const fallbackKey = makeKey();
    const cipher = createStorageCipher({
      keyRing: [primaryKey, fallbackKey],
    });
    const oldCipher = createStorageCipher({ keyRing: fallbackKey });
    const rows = new Map([
      [1, cipher.encrypt('current')],
      [2, oldCipher.encrypt('old')],
    ]);

    assert.deepEqual(
      await inspectEncryptedValues({ cipher, target: makeTarget(rows), batchSize: 1 }),
      {
        target: 'examples.encrypted_value',
        total: 2,
        current: 1,
        needsRotation: 1,
      },
    );
  });

  it('rotates fallback ciphertext and leaves current ciphertext unchanged', async () => {
    const primaryKey = makeKey();
    const fallbackKey = makeKey();
    const cipher = createStorageCipher({
      keyRing: [primaryKey, fallbackKey],
    });
    const oldCipher = createStorageCipher({ keyRing: fallbackKey });
    const currentCiphertext = cipher.encrypt('current');
    const rows = new Map([
      [1, currentCiphertext],
      [2, oldCipher.encrypt('old')],
    ]);

    const result = await rotateEncryptedValues({
      cipher,
      target: makeTarget(rows),
      batchSize: 1,
    });

    assert.equal(rows.get(1), currentCiphertext);
    assert.equal(cipher.decrypt(rows.get(2)!), 'old');
    assert.deepEqual(result, {
      target: 'examples.encrypted_value',
      passes: 1,
      attempted: 1,
      rotated: 1,
      conflicts: 0,
      verification: {
        target: 'examples.encrypted_value',
        total: 2,
        current: 2,
        needsRotation: 0,
      },
    });
  });

  it('retries compare-and-swap conflicts', async () => {
    const primaryKey = makeKey();
    const fallbackKey = makeKey();
    const cipher = createStorageCipher({
      keyRing: [primaryKey, fallbackKey],
    });
    const oldCipher = createStorageCipher({ keyRing: fallbackKey });
    const rows = new Map([[1, oldCipher.encrypt('old')]]);

    const result = await rotateEncryptedValues({
      cipher,
      target: makeTarget(rows, new Set([1])),
    });

    assert.equal(result.passes, 2);
    assert.equal(result.attempted, 2);
    assert.equal(result.rotated, 1);
    assert.equal(result.conflicts, 1);
    assert.equal(result.verification.needsRotation, 0);
  });

  it('reports incomplete verification after the configured number of passes', async () => {
    const primaryKey = makeKey();
    const fallbackKey = makeKey();
    const cipher = createStorageCipher({
      keyRing: [primaryKey, fallbackKey],
    });
    const oldCipher = createStorageCipher({ keyRing: fallbackKey });
    const rows = new Map([[1, oldCipher.encrypt('old')]]);
    const target = makeTarget(rows);
    target.replaceIfUnchanged = async () => false;

    const result = await rotateEncryptedValues({ cipher, target, maxPasses: 2 });

    assert.equal(result.passes, 2);
    assert.equal(result.conflicts, 2);
    assert.equal(result.verification.needsRotation, 1);
  });

  it('provides a checked high-level operation for application tooling', async () => {
    const primaryKey = makeKey();
    const fallbackKey = makeKey();
    const cipher = createStorageCipher({
      keyRing: [primaryKey, fallbackKey],
    });
    const oldCipher = createStorageCipher({ keyRing: fallbackKey });
    const rows = new Map([[1, oldCipher.encrypt('old')]]);
    const target = makeTarget(rows);

    const inspection = await runEncryptedValueOperation({ mode: 'check', cipher, target });
    assert.equal(inspection.needsRotation, 1);

    target.replaceIfUnchanged = async () => false;
    await expect(
      runEncryptedValueOperation({ mode: 'rotate', cipher, target, maxPasses: 1 }),
    ).rejects.toThrow(/left 1 values requiring rotation/);
  });

  it('refuses rotation while the configured write format is legacy', async () => {
    const cipher = createStorageCipher({
      keyRing: makeKey(),
      legacyFormat: legacyPrairieLearnFormat,
      writeFormat: 'legacy',
    });
    const rows = new Map([[1, cipher.encrypt('old')]]);

    await expect(rotateEncryptedValues({ cipher, target: makeTarget(rows) })).rejects.toThrow(
      /operators must ensure every writer/,
    );
    await expect(
      runEncryptedValueOperation({ mode: 'rotate', cipher, target: makeTarget(rows) }),
    ).rejects.toThrow(/operators must ensure every writer/);
  });
});
