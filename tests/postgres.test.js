// @ts-check
const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');
const { queryAsync, queryCursor } = require('@prairielearn/postgres');

chai.use(chaiAsPromised);
const { assert } = chai;

const helperDb = require('./helperDb');

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
      const cursor = queryCursor('SELECT * FROM workspaces WHERE id = 5;', {}, 10);
      let rowBatches = [];
      for await (const rows of cursor) {
        rowBatches.push(rows);
      }
      assert.lengthOf(rowBatches, 0);
    });

    it('returns one row at a time', async () => {
      const cursor = queryCursor('SELECT * FROM workspaces WHERE id <= 2;', {}, 1);
      const rowBatches = [];
      for await (const rows of cursor) {
        rowBatches.push(rows);
      }
      assert.lengthOf(rowBatches, 2);
      assert.lengthOf(rowBatches[0], 1);
      assert.lengthOf(rowBatches[1], 1);
    });

    it('returns all rows at once', async () => {
      const cursor = queryCursor('SELECT * FROM workspaces;', {}, 10);
      const rowBatches = [];
      for await (const rows of cursor) {
        rowBatches.push(rows);
      }
      assert.lengthOf(rowBatches, 1);
      assert.lengthOf(rowBatches[0], 4);
    });

    it('handles errors', async () => {
      const cursor = queryCursor('NOT VALID SQL', { foo: 'bar' }, 10);

      async function readAllRows() {
        const allRows = [];
        for await (const rows of cursor) {
          allRows.push(...rows);
        }
        return allRows;
      }

      // We do this instead of using `assert.isRejected()` because we need
      // access to the error object to check for extra properties.
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
