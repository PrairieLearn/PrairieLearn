import { assert, describe, it } from 'vitest';

import { finalizeBatchedMigration } from '@prairielearn/migrations';
import { execute, loadSqlEquiv, queryRows } from '@prairielearn/postgres';

import backfill from '../batched-migrations/20261014204106_courses__uuid__backfill.js';
import { CourseSchema } from '../lib/db-types.js';

import * as helperDb from './helperDb.js';

const sql = loadSqlEquiv(import.meta.url);
const migrationName = '20261014204106_courses__uuid__backfill';

describe('Course UUID backfill', () => {
  it('backfills missing UUIDs without changing existing course identities', async () => {
    await helperDb.testMigration({
      name: migrationName,
      beforeMigration: async () => {
        const existingUuid = crypto.randomUUID();
        for (const id of ['1000', '1001', '1500', '2000', '2001']) {
          await execute(sql.insert_course, {
            id,
            uuid: id === '1500' ? existingUuid : null,
            deleted: id === '2000',
          });
        }
        return existingUuid;
      },
      afterMigration: async (existingUuid) => {
        await backfill.execute(1001n, 2000n);
        const assigned = await queryRows(sql.select_courses, CourseSchema);
        assert.isNull(assigned[0].uuid);
        assert.isNotNull(assigned[1].uuid);
        assert.equal(assigned[2].uuid, existingUuid);
        assert.isNotNull(assigned[3].uuid);
        assert.notEqual(assigned[1].uuid, assigned[3].uuid);
        assert.isNull(assigned[4].uuid);

        await backfill.execute(1001n, 2000n);
        assert.deepEqual(
          (await queryRows(sql.select_courses, CourseSchema)).map((course) => course.uuid),
          assigned.map((course) => course.uuid),
        );

        await finalizeBatchedMigration(migrationName, { logProgress: false });
        const completed = await queryRows(sql.select_courses, CourseSchema);
        assert.isNotNull(completed[0].uuid);
        assert.isNotNull(completed[4].uuid);
      },
    });
  });
});
