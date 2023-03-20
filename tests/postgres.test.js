// @ts-check
const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');
const { queryAsync, queryCursor, queryValidatedCursor } = require('@prairielearn/postgres');
const { z, ZodError } = require('zod');

chai.use(chaiAsPromised);
const { assert } = chai;

const helperDb = require('./helperDb');

// TODO: move this into the `@prairielearn/postgres` package once the database
// helpers are in a shared package.
describe('@prairielearn/postgres', function () {
  before(async () => {
    await helperDb.before.call(this);

    // We use workspaces as a test case because they are a simple table.
    await queryAsync("INSERT INTO workspaces (id, state) VALUES (1,'uninitialized');", {});
    await queryAsync("INSERT INTO workspaces (id, state) VALUES (2, 'stopped');", {});
    await queryAsync("INSERT INTO workspaces (id, state) VALUES (3, 'launching');", {});
    await queryAsync("INSERT INTO workspaces (id, state) VALUES (4, 'running');", {});
  });

  after(async () => {
    await helperDb.after.call(this);
  });

  describe('queryCursor', () => {
    it('returns zero rows', async () => {
      const cursor = await queryCursor('SELECT * FROM workspaces WHERE id = 5;', {});
      let rowBatches = [];
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
      const cursor = queryCursor('SELECT * FROM workspaces;', {});
      const rowBatches = [];
      for await (const rows of (await cursor).iterate(10)) {
        rowBatches.push(rows);
      }
      assert.lengthOf(rowBatches, 1);
      assert.lengthOf(rowBatches[0], 4);
    });

    it('validates with provided schema', async () => {
      const WorkspaceSchema = z.object({
        id: z.string(),
      });
      const cursor = await queryValidatedCursor(
        'SELECT * FROM workspaces ORDER BY id ASC;',
        {},
        WorkspaceSchema
      );
      const allRows = [];
      for await (const rows of cursor.iterate(10)) {
        allRows.push(...rows);
      }
      assert.lengthOf(allRows, 4);
      const workspace = /** @type{any} */ (allRows[0]);
      assert.equal(workspace.id, '1');
      assert.isUndefined(workspace.state);
    });

    it('throws error when validation fails', async () => {
      const BadWorkspaceSchema = z.object({
        badProperty: z.string(),
      });
      const cursor = await queryValidatedCursor(
        'SELECT * FROM workspaces ORDER BY id ASC;',
        {},
        BadWorkspaceSchema
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
      assert.lengthOf(maybeError.errors, 4);
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
});
