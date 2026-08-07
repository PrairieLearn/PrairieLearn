import * as crypto from 'node:crypto';

import { assert, beforeEach, describe, expect, it, vi } from 'vitest';

import type * as PostgresModule from '@prairielearn/postgres';

import { createStorageCipher } from './cipher.js';
import { prairieLearnCiphertextFormat } from './formats.js';
import { runPostgresEncryptedColumnOperation } from './postgres.js';

const postgresMocks = vi.hoisted(() => ({
  execute: vi.fn(),
  queryRows: vi.fn(),
  queryScalar: vi.fn(),
}));

vi.mock('@prairielearn/postgres', async (importOriginal) => {
  const actual = await importOriginal<typeof PostgresModule>();
  return {
    ...actual,
    execute: postgresMocks.execute,
    queryRows: postgresMocks.queryRows,
    queryScalar: postgresMocks.queryScalar,
  };
});

function makeKey() {
  return crypto.randomBytes(32).toString('hex');
}

function mockDatabase(rows: Map<string, string | null>, conflictOnce = false) {
  postgresMocks.queryRows.mockImplementation(
    (
      _query: string,
      params: { nullable: boolean; after_cursor: string | null; batch_size: number },
    ) => {
      const result = [...rows.entries()]
        .filter(([cursor]) => params.after_cursor === null || cursor > params.after_cursor)
        .filter(([, ciphertext]) => !params.nullable || ciphertext !== null)
        .sort(([a], [b]) => a.localeCompare(b))
        .slice(0, params.batch_size)
        .map(([cursor, ciphertext]) => ({ cursor, ciphertext }));
      return Promise.resolve(result);
    },
  );
  postgresMocks.execute.mockImplementation(
    (
      _query: string,
      params: {
        cursor: string;
        expected_ciphertext: string;
        replacement_ciphertext: string;
      },
    ) => {
      if (conflictOnce) {
        conflictOnce = false;
        return Promise.resolve(0);
      }
      if (rows.get(params.cursor) !== params.expected_ciphertext) return Promise.resolve(0);
      rows.set(params.cursor, params.replacement_ciphertext);
      return Promise.resolve(1);
    },
  );
}

function operationOptions(cipher: ReturnType<typeof createStorageCipher>) {
  return {
    cipher,
    tableName: 'example"table',
    primaryKeyColumnName: 'example"id',
    ciphertextColumnName: 'example"ciphertext',
    nullable: false,
  };
}

describe('Postgres encrypted column operations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    postgresMocks.queryScalar.mockResolvedValue(true);
  });

  it('checks non-null values in bounded keyset batches with escaped identifiers', async () => {
    const primaryKey = makeKey();
    const fallbackKey = makeKey();
    const cipher = createStorageCipher({
      keyRing: [primaryKey, fallbackKey],
      format: prairieLearnCiphertextFormat,
    });
    const rows = new Map([
      ['1', cipher.encrypt('current')],
      ['2', null],
      ['3', prairieLearnCiphertextFormat.encrypt('old', fallbackKey)],
    ]);
    mockDatabase(rows);

    const result = await runPostgresEncryptedColumnOperation({
      mode: 'check',
      ...operationOptions(cipher),
      nullable: true,
      batchSize: 1,
    });

    assert.deepEqual(result, {
      target: 'example"table.example"ciphertext',
      total: 2,
      needsRotation: 1,
    });
    assert.deepEqual(postgresMocks.queryScalar.mock.calls[0][1], {
      table_name: '"example""table"',
      primary_key_column_name: 'example"id',
    });
    assert.include(postgresMocks.queryRows.mock.calls[0][0], '"example""id"::text AS cursor');
    assert.include(postgresMocks.queryRows.mock.calls[0][0], '"example""ciphertext" AS ciphertext');
    assert.include(
      postgresMocks.queryRows.mock.calls[0][0],
      'OR "example""ciphertext" IS NOT NULL',
    );
    assert.isTrue(postgresMocks.queryRows.mock.calls[0][1].nullable);
    assert.equal(postgresMocks.queryRows.mock.calls[0][1].batch_size, 1);
  });

  it('rotates with compare-and-swap updates, retries conflicts, and verifies the result', async () => {
    const primaryKey = makeKey();
    const fallbackKey = makeKey();
    const cipher = createStorageCipher({
      keyRing: [primaryKey, fallbackKey],
      format: prairieLearnCiphertextFormat,
    });
    const rows = new Map([['1', prairieLearnCiphertextFormat.encrypt('old', fallbackKey)]]);
    mockDatabase(rows, true);

    const result = await runPostgresEncryptedColumnOperation({
      mode: 'rotate',
      ...operationOptions(cipher),
    });

    assert.deepEqual(result, {
      target: 'example"table.example"ciphertext',
      total: 1,
      needsRotation: 0,
      passes: 2,
      rotated: 1,
      conflicts: 1,
    });
    assert.equal(cipher.decrypt(rows.get('1')!), 'old');
    assert.include(postgresMocks.execute.mock.calls[0][0], 'UPDATE "example""table"');
    assert.include(
      postgresMocks.execute.mock.calls[0][0],
      '"example""ciphertext" = $expected_ciphertext',
    );
  });

  it('fails when final verification still finds values requiring rotation', async () => {
    const primaryKey = makeKey();
    const fallbackKey = makeKey();
    const cipher = createStorageCipher({
      keyRing: [primaryKey, fallbackKey],
      format: prairieLearnCiphertextFormat,
    });
    const rows = new Map([['1', prairieLearnCiphertextFormat.encrypt('old', fallbackKey)]]);
    mockDatabase(rows);
    postgresMocks.execute.mockResolvedValue(0);

    await expect(
      runPostgresEncryptedColumnOperation({
        mode: 'rotate',
        ...operationOptions(cipher),
        maxPasses: 2,
      }),
    ).rejects.toThrow(
      /left 1 values requiring rotation after 2 passes \(2 concurrent update conflicts\)/,
    );
  });

  it('rejects a cursor that is not the table single-column primary key', async () => {
    postgresMocks.queryScalar.mockResolvedValue(false);
    const cipher = createStorageCipher({
      keyRing: makeKey(),
      format: prairieLearnCiphertextFormat,
    });

    await expect(
      runPostgresEncryptedColumnOperation({ mode: 'check', ...operationOptions(cipher) }),
    ).rejects.toThrow('must use a single-column primary key');
    expect(postgresMocks.queryRows).not.toHaveBeenCalled();
  });
});
