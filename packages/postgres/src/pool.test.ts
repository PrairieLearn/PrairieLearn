import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import { Writable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { z, ZodError } from 'zod';

import {
  queryAsync,
  queryRows,
  queryRow,
  queryOptionalRow,
  callRows,
  callRow,
  callOptionalRow,
  queryCursor,
  queryValidatedCursor,
} from './default-pool';
import { makePostgresTestUtils } from './test-utils';

chai.use(chaiAsPromised);
const { assert } = chai;

const postgresTestUtils = makePostgresTestUtils({
  database: 'prairielearn_postgres',
});

const WorkspaceSchema = z.object({
  id: z.string(),
  created_at: z.date(),
});

const SprocTwoColumnsSchema = z.object({
  id: z.string(),
  negative: z.number(),
});

describe('@prairielearn/postgres', function () {
  before(async () => {
    await postgresTestUtils.createDatabase();
    await queryAsync(
      'CREATE TABLE workspaces (id BIGSERIAL PRIMARY KEY, created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP);',
      {},
    );
    await queryAsync('INSERT INTO workspaces (id) SELECT s FROM generate_series(1, 100) AS s', {});
    await queryAsync(
      'CREATE FUNCTION test_sproc_one_column(num_entries INT) RETURNS TABLE (id BIGINT) AS $$ BEGIN RETURN QUERY SELECT s::BIGINT AS id FROM generate_series(1, num_entries) AS s; END; $$ LANGUAGE plpgsql;',
      {},
    );
    await queryAsync(
      'CREATE FUNCTION test_sproc_two_columns(num_entries INT) RETURNS TABLE (id BIGINT, negative INT) AS $$ BEGIN RETURN QUERY SELECT s::BIGINT AS id, -s AS negative FROM generate_series(1, num_entries) AS s; END; $$ LANGUAGE plpgsql;',
      {},
    );
    await queryAsync(
      'CREATE FUNCTION test_sproc_one_column_ten_rows() RETURNS TABLE (id BIGINT) AS $$ BEGIN RETURN QUERY SELECT s::BIGINT AS id FROM generate_series(1, 10) AS s; END; $$ LANGUAGE plpgsql;',
      {},
    );
    await queryAsync(
      'CREATE FUNCTION test_sproc_one_column_one_row(OUT id BIGINT) AS $$ BEGIN id = 1; END; $$ LANGUAGE plpgsql;',
      {},
    );
  });

  after(async () => {
    await postgresTestUtils.dropDatabase();
  });

  describe('queryRows', () => {
    it('handles single column', async () => {
      const rows = await queryRows('SELECT id FROM workspaces WHERE id <= 10;', z.string());
      assert.lengthOf(rows, 10);
      assert.equal(rows[0], '1');
    });

    it('handles multiple columns', async () => {
      const rows = await queryRows('SELECT * FROM workspaces WHERE id <= 10;', WorkspaceSchema);
      assert.lengthOf(rows, 10);
      assert.equal(rows[0].id, '1');
      assert.isNotNull(rows[0].created_at);
    });

    it('handles parameters', async () => {
      const rows = await queryRows(
        'SELECT * FROM workspaces WHERE id <= $1;',
        [10],
        WorkspaceSchema,
      );
      assert.lengthOf(rows, 10);
    });
  });

  describe('queryRow', () => {
    it('handles single column', async () => {
      const row = await queryRow('SELECT id FROM workspaces WHERE id = 1;', z.string());
      assert.equal(row, '1');
    });

    it('handles multiple columns', async () => {
      const row = await queryRow('SELECT * FROM workspaces WHERE id = 1;', WorkspaceSchema);
      assert.equal(row.id, '1');
      assert.isNotNull(row.created_at);
    });

    it('handles parameters', async () => {
      const row = await queryRow('SELECT * FROM workspaces WHERE id = $1;', [1], WorkspaceSchema);
      assert.equal(row.id, '1');
    });

    it('rejects results with zero rows', async () => {
      const rows = queryRow('SELECT * FROM workspaces WHERE id = -1;', WorkspaceSchema);
      await assert.isRejected(rows, 'Incorrect rowCount: 0');
    });

    it('rejects results with multiple rows', async () => {
      const rows = queryRow('SELECT * FROM workspaces', WorkspaceSchema);
      await assert.isRejected(rows, 'Incorrect rowCount: 100');
    });
  });

  describe('queryOptionalRow', () => {
    it('handles single column', async () => {
      const row = await queryRow('SELECT id FROM workspaces WHERE id = 1;', z.string());
      assert.equal(row, '1');
    });

    it('handles multiple columns', async () => {
      const row = await queryOptionalRow('SELECT * FROM workspaces WHERE id = 1;', WorkspaceSchema);
      assert.isNotNull(row);
      assert.equal(row?.id, '1');
      assert.isNotNull(row?.created_at);
    });

    it('handles parameters', async () => {
      const row = await queryOptionalRow(
        'SELECT * FROM workspaces WHERE id = $1;',
        [1],
        WorkspaceSchema,
      );
      assert.isNotNull(row);
      assert.equal(row?.id, '1');
    });

    it('handles missing result', async () => {
      const row = await queryOptionalRow(
        'SELECT * FROM workspaces WHERE id = -1;',
        WorkspaceSchema,
      );
      assert.isNull(row);
    });

    it('rejects with multiple rows', async () => {
      const rows = queryOptionalRow('SELECT * FROM workspaces', WorkspaceSchema);
      await assert.isRejected(rows, 'Incorrect rowCount: 100');
    });
  });

  describe('callRows', () => {
    it('handles single column', async () => {
      const rows = await callRows('test_sproc_one_column_ten_rows', z.string());
      assert.lengthOf(rows, 10);
      assert.equal(rows[0], '1');
    });

    it('handles parameters', async () => {
      const rows = await callRows('test_sproc_one_column', [10], z.string());
      assert.lengthOf(rows, 10);
      assert.equal(rows[0], '1');
    });

    it('handles multiple columns', async () => {
      const rows = await callRows('test_sproc_two_columns', [20], SprocTwoColumnsSchema);
      assert.lengthOf(rows, 20);
      assert.equal(rows[0].id, '1');
      assert.equal(rows[0].negative, -1);
      assert.equal(rows[19].id, '20');
      assert.equal(rows[19].negative, -20);
    });
  });

  describe('callRow', () => {
    it('handles single column', async () => {
      const row = await callRow('test_sproc_one_column_one_row', z.string());
      assert.equal(row, '1');
    });

    it('handles parameters', async () => {
      const row = await callRow('test_sproc_one_column', [1], z.string());
      assert.equal(row, '1');
    });

    it('handles multiple columns', async () => {
      const row = await callRow('test_sproc_two_columns', [1], SprocTwoColumnsSchema);
      assert.equal(row.id, '1');
      assert.equal(row.negative, -1);
    });

    it('rejects results with zero rows', async () => {
      const row = callRow('test_sproc_two_columns', [0], SprocTwoColumnsSchema);
      await assert.isRejected(row, 'Incorrect rowCount: 0');
    });

    it('rejects results with multiple rows', async () => {
      const rows = callRow('test_sproc_two_columns', [100], SprocTwoColumnsSchema);
      await assert.isRejected(rows, 'Incorrect rowCount: 100');
    });
  });

  describe('callOptionalRow', () => {
    it('handles single column', async () => {
      const row = await callOptionalRow('test_sproc_one_column_one_row', z.string());
      assert.equal(row, '1');
    });

    it('handles parameters', async () => {
      const row = await callOptionalRow('test_sproc_one_column', [1], z.string());
      assert.equal(row, '1');
    });

    it('handles multiple columns', async () => {
      const row = await callOptionalRow('test_sproc_two_columns', [1], SprocTwoColumnsSchema);
      assert.isNotNull(row);
      assert.equal(row?.id, '1');
      assert.equal(row?.negative, -1);
    });

    it('handles results with zero rows', async () => {
      const row = await callOptionalRow('test_sproc_two_columns', [0], SprocTwoColumnsSchema);
      assert.isNull(row);
    });

    it('rejects results with multiple rows', async () => {
      const rows = callOptionalRow('test_sproc_two_columns', [100], SprocTwoColumnsSchema);
      await assert.isRejected(rows, 'Incorrect rowCount: 100');
    });
  });

  describe('queryCursor', () => {
    it('returns zero rows', async () => {
      const cursor = await queryCursor('SELECT * FROM workspaces WHERE id = 10000;', {});
      const rowBatches = [];
      for await (const rows of cursor.iterate(10)) {
        rowBatches.push(rows);
      }
      assert.lengthOf(rowBatches, 0);
    });

    it('returns one row at a time', async () => {
      const cursor = await queryCursor('SELECT * FROM workspaces WHERE id <= 2;', {});
      const rowBatches = [];
      for await (const rows of cursor.iterate(1)) {
        rowBatches.push(rows);
      }
      assert.lengthOf(rowBatches, 2);
      assert.lengthOf(rowBatches[0], 1);
      assert.lengthOf(rowBatches[1], 1);
    });

    it('returns all rows at once', async () => {
      const cursor = queryCursor('SELECT * FROM workspaces WHERE id <= 10;', {});
      const rowBatches = [];
      for await (const rows of (await cursor).iterate(10)) {
        rowBatches.push(rows);
      }
      assert.lengthOf(rowBatches, 1);
      assert.lengthOf(rowBatches[0], 10);
    });

    it('handles errors', async () => {
      const cursor = await queryCursor('NOT VALID SQL', { foo: 'bar' });

      async function readAllRows() {
        const allRows = [];
        for await (const rows of cursor.iterate(10)) {
          allRows.push(...rows);
        }
        return allRows;
      }

      const maybeError = await readAllRows().catch((err) => err);
      assert.instanceOf(maybeError, Error);
      assert.match(maybeError.message, /syntax error/);
      assert.isDefined(maybeError.data);
      assert.equal(maybeError.data.sql, 'NOT VALID SQL');
      assert.deepEqual(maybeError.data.sqlParams, { foo: 'bar' });
      assert.isDefined(maybeError.data.sqlError);
      assert.equal(maybeError.data.sqlError.severity, 'ERROR');
    });
  });

  describe('queryValidatedCursor', () => {
    const WorkspaceSchema = z.object({
      id: z.string(),
    });

    const BadWorkspaceSchema = z.object({
      badProperty: z.string(),
    });

    describe('iterator', () => {
      it('validates with provided schema', async () => {
        const cursor = await queryValidatedCursor(
          'SELECT * FROM workspaces WHERE id <= 10 ORDER BY id ASC;',
          {},
          WorkspaceSchema,
        );
        const allRows = [];
        for await (const rows of cursor.iterate(10)) {
          allRows.push(...rows);
        }
        assert.lengthOf(allRows, 10);
        const workspace = allRows[0] as any;
        assert.equal(workspace.id, '1');
        assert.isUndefined(workspace.state);
      });

      it('throws error when validation fails', async () => {
        const cursor = await queryValidatedCursor(
          'SELECT * FROM workspaces WHERE id <= 10 ORDER BY id ASC;',
          {},
          BadWorkspaceSchema,
        );

        async function readAllRows() {
          const allRows = [];
          for await (const rows of cursor.iterate(10)) {
            allRows.push(...rows);
          }
          return allRows;
        }

        const maybeError = await readAllRows().catch((err) => err);
        assert.instanceOf(maybeError, ZodError);
        assert.lengthOf(maybeError.errors, 10);
      });
    });

    describe('stream', () => {
      it('validates with provided schema', async () => {
        const cursor = await queryValidatedCursor(
          'SELECT * FROM workspaces WHERE id <= 10 ORDER BY id ASC;',
          {},
          WorkspaceSchema,
        );
        const stream = cursor.stream(1);
        const allRows = [];
        for await (const row of stream) {
          allRows.push(row);
        }

        assert.lengthOf(allRows, 10);
      });

      it('emits an error when validation fails', async () => {
        const cursor = await queryValidatedCursor(
          'SELECT * FROM workspaces ORDER BY id ASC;',
          {},
          BadWorkspaceSchema,
        );
        const stream = cursor.stream(1);

        async function readAllRows() {
          const allRows = [];
          for await (const row of stream) {
            allRows.push(row);
          }
          return allRows;
        }

        const maybeError = await readAllRows().catch((err) => err);
        assert.instanceOf(maybeError, ZodError);
        assert.lengthOf(maybeError.errors, 1);
      });

      it('closes the cursor when the stream is closed', async () => {
        const cursor = await queryValidatedCursor('SELECT * FROM workspaces;', {}, WorkspaceSchema);
        const stream = cursor.stream(1);

        const rows: any[] = [];
        const ac = new AbortController();
        const writable = new Writable({
          objectMode: true,
          write(chunk, _encoding, callback) {
            rows.push(chunk);

            // After receiving the first row, abort the stream. This lets us test
            // that the underlying cursor is closed. If it is *not* closed, this
            // `after` hook will fail with a timeout.
            ac.abort();
            callback();
          },
        });

        await assert.isRejected(pipeline(stream, writable, { signal: ac.signal }));
        assert.lengthOf(rows, 1);
      });
    });
  });
});
