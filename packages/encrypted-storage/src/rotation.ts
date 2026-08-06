import type { StorageCipher } from './cipher.js';

export interface EncryptedValueRow<Cursor> {
  cursor: Cursor;
  ciphertext: string;
}

export interface EncryptedValueTarget<Cursor> {
  name: string;
  selectBatch(options: {
    after: Cursor | null;
    limit: number;
  }): Promise<EncryptedValueRow<Cursor>[]>;
  replaceIfUnchanged(options: {
    cursor: Cursor;
    expectedCiphertext: string;
    replacementCiphertext: string;
  }): Promise<boolean>;
}

export interface EncryptionInspection {
  target: string;
  total: number;
  current: number;
  needsRotation: number;
}

export interface EncryptionRotation {
  target: string;
  passes: number;
  attempted: number;
  rotated: number;
  conflicts: number;
  verification: EncryptionInspection;
}

export type EncryptionOperationMode = 'check' | 'rotate';

function validatePositiveInteger(value: number, name: string) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
}

async function forEachEncryptedValue<Cursor>({
  target,
  batchSize,
  fn,
}: {
  target: EncryptedValueTarget<Cursor>;
  batchSize: number;
  fn: (row: EncryptedValueRow<Cursor>) => Promise<void> | void;
}) {
  let after: Cursor | null = null;
  while (true) {
    const rows = await target.selectBatch({ after, limit: batchSize });
    if (rows.length === 0) return;
    if (rows.length > batchSize) {
      throw new Error(
        `Encryption target ${target.name} returned more than the requested batch size`,
      );
    }
    for (const row of rows) await fn(row);
    after = rows.at(-1)!.cursor;
  }
}

export async function inspectEncryptedValues<Cursor>({
  cipher,
  target,
  batchSize = 100,
}: {
  cipher: StorageCipher;
  target: EncryptedValueTarget<Cursor>;
  batchSize?: number;
}): Promise<EncryptionInspection> {
  validatePositiveInteger(batchSize, 'batchSize');
  const result: EncryptionInspection = {
    target: target.name,
    total: 0,
    current: 0,
    needsRotation: 0,
  };
  await forEachEncryptedValue({
    target,
    batchSize,
    fn: ({ ciphertext }) => {
      result.total += 1;
      if (cipher.inspect(ciphertext).needsRotation) {
        result.needsRotation += 1;
      } else {
        result.current += 1;
      }
    },
  });
  return result;
}

export async function rotateEncryptedValues<Cursor>({
  cipher,
  target,
  batchSize = 100,
  maxPasses = 3,
}: {
  cipher: StorageCipher;
  target: EncryptedValueTarget<Cursor>;
  batchSize?: number;
  maxPasses?: number;
}): Promise<EncryptionRotation> {
  validatePositiveInteger(batchSize, 'batchSize');
  validatePositiveInteger(maxPasses, 'maxPasses');
  if (cipher.writeFormat !== 'v1') {
    throw new Error(
      'Encryption rotation requires this cipher to use v1 writes; operators must ensure every writer uses the same format and primary key',
    );
  }

  const result: EncryptionRotation = {
    target: target.name,
    passes: 0,
    attempted: 0,
    rotated: 0,
    conflicts: 0,
    verification: {
      target: target.name,
      total: 0,
      current: 0,
      needsRotation: 0,
    },
  };

  for (let pass = 1; pass <= maxPasses; pass += 1) {
    result.passes = pass;
    await forEachEncryptedValue({
      target,
      batchSize,
      fn: async ({ cursor, ciphertext }) => {
        const rotation = cipher.rotate(ciphertext);
        if (!rotation.rotated) return;

        result.attempted += 1;
        const replaced = await target.replaceIfUnchanged({
          cursor,
          expectedCiphertext: ciphertext,
          replacementCiphertext: rotation.ciphertext,
        });
        if (replaced) {
          result.rotated += 1;
        } else {
          result.conflicts += 1;
        }
      },
    });

    result.verification = await inspectEncryptedValues({ cipher, target, batchSize });
    if (result.verification.needsRotation === 0) return result;
  }

  return result;
}

interface EncryptionOperationOptions<Cursor> {
  cipher: StorageCipher;
  target: EncryptedValueTarget<Cursor>;
  mode: EncryptionOperationMode;
  batchSize?: number;
  maxPasses?: number;
}

export function runEncryptedValueOperation<Cursor>(
  options: EncryptionOperationOptions<Cursor> & { mode: 'check' },
): Promise<EncryptionInspection>;
export function runEncryptedValueOperation<Cursor>(
  options: EncryptionOperationOptions<Cursor> & { mode: 'rotate' },
): Promise<EncryptionRotation>;
export function runEncryptedValueOperation<Cursor>(
  options: EncryptionOperationOptions<Cursor>,
): Promise<EncryptionInspection | EncryptionRotation>;
export async function runEncryptedValueOperation<Cursor>({
  cipher,
  target,
  mode,
  batchSize = 100,
  maxPasses = 3,
}: EncryptionOperationOptions<Cursor>): Promise<EncryptionInspection | EncryptionRotation> {
  if (mode === 'check') {
    return await inspectEncryptedValues({ cipher, target, batchSize });
  }

  const result = await rotateEncryptedValues({ cipher, target, batchSize, maxPasses });
  if (result.verification.needsRotation !== 0) {
    throw new Error(
      `Encryption rotation for ${target.name} left ${result.verification.needsRotation} values requiring rotation after ${result.passes} passes (${result.conflicts} concurrent update conflicts)`,
    );
  }
  return result;
}
