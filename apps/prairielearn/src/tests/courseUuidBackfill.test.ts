import { assert, describe, it } from 'vitest';
import { z } from 'zod';

import {
  finalizeBatchedMigration,
  selectBatchedMigrationForTimestamp,
} from '@prairielearn/migrations';
import { execute, loadSqlEquiv, queryRows } from '@prairielearn/postgres';

import backfill from '../batched-migrations/20261014204106_courses__uuid__backfill.js';
import { CourseSchema } from '../lib/db-types.js';

import * as helperDb from './helperDb.js';

const sql = loadSqlEquiv(import.meta.url);
const migrationName = '20261014204106_courses__uuid__backfill';
const timestamp = '20261014204106';

describe('Course UUID backfill', () => {
  it('queues bounded batches, preserves assigned UUIDs, and fills live and deleted courses', async () => {
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
        const queued = await selectBatchedMigrationForTimestamp('prairielearn', timestamp);
        assert.equal(queued.status, 'pending');
        assert.equal(queued.min_value, 1000n);
        assert.equal(queued.max_value, 2001n);
        assert.equal(queued.batch_size, 1000);

        await backfill.execute(1001n, 2000n);
        const assigned = await queryRows(sql.select_courses, CourseSchema);
        assert.lengthOf(assigned, 5);
        assert.isNull(assigned[0].uuid);
        z.guid().parse(assigned[1].uuid);
        assert.equal(assigned[2].uuid, existingUuid);
        z.guid().parse(assigned[3].uuid);
        assert.isNotNull(assigned[3].deleted_at);
        assert.isNull(assigned[4].uuid);

        await backfill.execute(1001n, 2000n);
        assert.deepEqual(await queryRows(sql.select_courses, CourseSchema), assigned);

        await finalizeBatchedMigration(migrationName, { logProgress: false });
        const completed = await queryRows(sql.select_courses, CourseSchema);
        for (const course of completed) {
          z.guid().parse(course.uuid);
        }
        assert.equal(new Set(completed.map((course) => course.uuid)).size, completed.length);
        assert.equal(completed[1].uuid, assigned[1].uuid);
        assert.equal(completed[2].uuid, existingUuid);
        assert.equal(completed[3].uuid, assigned[3].uuid);
        assert.equal(
          (await selectBatchedMigrationForTimestamp('prairielearn', timestamp)).status,
          'succeeded',
        );
      },
    });
  });
});
