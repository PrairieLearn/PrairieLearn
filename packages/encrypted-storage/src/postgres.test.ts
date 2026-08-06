import { beforeEach, describe, expect, it, vi } from 'vitest';

import type * as PostgresModule from '@prairielearn/postgres';

import { createPostgresEncryptedValueTarget } from './postgres.js';

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

describe('Postgres encrypted value target', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    postgresMocks.queryScalar.mockResolvedValue(true);
  });

  it('selects bounded batches in cursor order', async () => {
    postgresMocks.queryRows.mockResolvedValue([{ cursor: '1', ciphertext: 'ciphertext' }]);
    const target = createPostgresEncryptedValueTarget({
      tableName: 'example_table',
      primaryKeyColumnName: 'id',
      ciphertextColumnName: 'encrypted_value',
    });

    await expect(target.selectBatch({ after: null, limit: 20 })).resolves.toEqual([
      { cursor: '1', ciphertext: 'ciphertext' },
    ]);
    expect(postgresMocks.queryScalar.mock.calls[0][1]).toEqual({
      table_name: '"example_table"',
      primary_key_column_name: 'id',
    });
    expect(postgresMocks.queryRows.mock.calls[0][0]).toContain(
      'SELECT\n  "id"::text AS cursor,\n  "encrypted_value" AS ciphertext',
    );
    expect(postgresMocks.queryRows.mock.calls[0][0]).not.toContain('WHERE');
    expect(postgresMocks.queryRows.mock.calls[0][1]).toEqual({ batch_size: 20 });

    await target.selectBatch({ after: '1', limit: 10 });
    expect(postgresMocks.queryRows.mock.calls[1][0]).toContain('WHERE\n  "id" > $after_cursor');
    expect(postgresMocks.queryRows.mock.calls[1][1]).toEqual({
      after_cursor: '1',
      batch_size: 10,
    });
    expect(postgresMocks.queryScalar).toHaveBeenCalledTimes(1);
  });

  it('escapes identifiers and compares the old ciphertext when updating', async () => {
    postgresMocks.execute.mockResolvedValue(1);
    const target = createPostgresEncryptedValueTarget({
      tableName: 'example"table',
      primaryKeyColumnName: 'example"id',
      ciphertextColumnName: 'example"ciphertext',
    });

    await expect(
      target.replaceIfUnchanged({
        cursor: '12',
        expectedCiphertext: 'old',
        replacementCiphertext: 'new',
      }),
    ).resolves.toBe(true);
    expect(postgresMocks.execute.mock.calls[0][0]).toContain('UPDATE "example""table"');
    expect(postgresMocks.execute.mock.calls[0][0]).toContain('"example""id" = $cursor');
    expect(postgresMocks.execute.mock.calls[0][0]).toContain(
      '"example""ciphertext" = $expected_ciphertext',
    );
    expect(postgresMocks.execute.mock.calls[0][1]).toEqual({
      cursor: '12',
      expected_ciphertext: 'old',
      replacement_ciphertext: 'new',
    });
  });

  it('reports compare-and-swap conflicts', async () => {
    postgresMocks.execute.mockResolvedValue(0);
    const target = createPostgresEncryptedValueTarget({
      tableName: 'example_table',
      primaryKeyColumnName: 'id',
      ciphertextColumnName: 'encrypted_value',
    });

    await expect(
      target.replaceIfUnchanged({
        cursor: '12',
        expectedCiphertext: 'old',
        replacementCiphertext: 'new',
      }),
    ).resolves.toBe(false);
  });

  it('rejects updates that affect multiple primary-key rows', async () => {
    postgresMocks.execute.mockResolvedValue(2);
    const target = createPostgresEncryptedValueTarget({
      tableName: 'example_table',
      primaryKeyColumnName: 'id',
      ciphertextColumnName: 'encrypted_value',
    });

    await expect(
      target.replaceIfUnchanged({
        cursor: '12',
        expectedCiphertext: 'old',
        replacementCiphertext: 'new',
      }),
    ).rejects.toThrow('primary key update affected multiple rows');
  });

  it('rejects a cursor that is not the table single-column primary key', async () => {
    postgresMocks.queryScalar.mockResolvedValue(false);
    const target = createPostgresEncryptedValueTarget({
      tableName: 'example_table',
      primaryKeyColumnName: 'not_the_primary_key',
      ciphertextColumnName: 'encrypted_value',
    });

    await expect(target.selectBatch({ after: null, limit: 20 })).rejects.toThrow(
      'must use a single-column primary key as its cursor',
    );
    expect(postgresMocks.queryRows).not.toHaveBeenCalled();
  });
});
