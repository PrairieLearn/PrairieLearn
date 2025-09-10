import z from 'zod';

import { makeBatchedMigration } from '@prairielearn/migrations';
import { execute, loadSqlEquiv, queryRow } from '@prairielearn/postgres';

import { uniqueEnrollmentCode } from '../sync/fromDisk/courseInstances.js';

const sql = loadSqlEquiv(import.meta.url);

export default makeBatchedMigration({
  async getParameters() {
    const max = await queryRow(sql.select_bounds, z.coerce.bigint().nullable());
    return {
      min: 1n,
      max,
      batchSize: 1,
    };
  },

  async execute(start: bigint, _end: bigint) {
    await execute(sql.update_course_instances_enrollment_code, {
      id: start,
      enrollment_code: await uniqueEnrollmentCode(),
    });
  },
});
