import { afterAll, assert, beforeAll, describe, it } from 'vitest';

import { execute, loadSql, loadSqlEquiv, queryScalar } from '@prairielearn/postgres';
import { IdSchema } from '@prairielearn/zod';

import * as helperDb from '../tests/helperDb.js';

import { EnumJobStatusSchema } from './db-types.js';

// Production SQL blocks under test.
const productionSql = loadSql(new URL('server-jobs.sql', import.meta.url).pathname);
// Test-only setup/assertion blocks.
const sql = loadSqlEquiv(import.meta.url);

async function insertJobSequence(status: 'Running' | 'Stopping'): Promise<{
  job_sequence_id: string;
  job_id: string;
}> {
  const sequenceId = await queryScalar(sql.insert_test_job_sequence, { status }, IdSchema);
  const jobId = await queryScalar(sql.insert_test_job, { job_sequence_id: sequenceId }, IdSchema);
  return { job_sequence_id: sequenceId, job_id: jobId };
}

async function selectStatus(job_sequence_id: string): Promise<string> {
  return await queryScalar(sql.select_status, { job_sequence_id }, EnumJobStatusSchema);
}

async function selectJobStatus(job_id: string): Promise<string> {
  return await queryScalar(sql.select_job_status, { job_id }, EnumJobStatusSchema);
}

describe('server-jobs SQL transitions', () => {
  beforeAll(helperDb.before);
  afterAll(helperDb.after);

  describe('update_job_on_finish', () => {
    it('Running + Success → Success on both rows', async () => {
      const { job_sequence_id, job_id } = await insertJobSequence('Running');
      await execute(productionSql.update_job_on_finish, {
        job_sequence_id,
        job_id,
        output: '',
        data: {},
        status: 'Success',
      });
      assert.equal(await selectStatus(job_sequence_id), 'Success');
      assert.equal(await selectJobStatus(job_id), 'Success');
    });

    it('Running + Error → Error on both rows', async () => {
      const { job_sequence_id, job_id } = await insertJobSequence('Running');
      await execute(productionSql.update_job_on_finish, {
        job_sequence_id,
        job_id,
        output: '',
        data: {},
        status: 'Error',
      });
      assert.equal(await selectStatus(job_sequence_id), 'Error');
      assert.equal(await selectJobStatus(job_id), 'Error');
    });

    it('Running + Stopped → Stopped on both rows (explicit job.stop())', async () => {
      const { job_sequence_id, job_id } = await insertJobSequence('Running');
      await execute(productionSql.update_job_on_finish, {
        job_sequence_id,
        job_id,
        output: '',
        data: {},
        status: 'Stopped',
      });
      assert.equal(await selectStatus(job_sequence_id), 'Stopped');
      assert.equal(await selectJobStatus(job_id), 'Stopped');
    });

    // Stop-intent semantics on a Stopping sequence:
    //   Success → Stopped (atomic projection; covers the race where the stop
    //     click landed between the caller's read and this UPDATE)
    //   Error   → Error   (real failures are preserved over the stop projection)
    //   Stopped → Stopped (explicit job.stop())
    it.each([
      ['Success', 'Stopped'],
      ['Error', 'Error'],
      ['Stopped', 'Stopped'],
    ] as const)('Stopping + %s → %s on both rows', async (inputStatus, expectedStatus) => {
      const { job_sequence_id, job_id } = await insertJobSequence('Stopping');
      await execute(productionSql.update_job_on_finish, {
        job_sequence_id,
        job_id,
        output: '',
        data: {},
        status: inputStatus,
      });
      assert.equal(await selectStatus(job_sequence_id), expectedStatus);
      assert.equal(await selectJobStatus(job_id), expectedStatus);
    });
  });

  describe('update_job_on_error', () => {
    it('Stopping → Error (preserve worker failure signal)', async () => {
      const { job_sequence_id, job_id } = await insertJobSequence('Stopping');
      await execute(productionSql.update_job_on_error, {
        job_id,
        output: null,
        error_message: 'abandoned',
      });
      assert.equal(await selectStatus(job_sequence_id), 'Error');
    });

    it('Running → Error', async () => {
      const { job_sequence_id, job_id } = await insertJobSequence('Running');
      await execute(productionSql.update_job_on_error, {
        job_id,
        output: null,
        error_message: 'abandoned',
      });
      assert.equal(await selectStatus(job_sequence_id), 'Error');
    });

    it("doesn't overwrite an already-terminal sequence", async () => {
      // Reproduces the race where an orchestrator landed Stopped on the
      // sequence while the inner job was still Running, and the abandoned-job
      // sweeper would otherwise clobber it back to Error.
      const { job_sequence_id, job_id } = await insertJobSequence('Stopping');
      await execute(sql.mark_sequence_stopped, { job_sequence_id });
      await execute(productionSql.update_job_on_error, {
        job_id,
        output: null,
        error_message: 'abandoned',
      });
      assert.equal(await selectStatus(job_sequence_id), 'Stopped');
    });
  });

  describe('error_abandoned_job_sequences', () => {
    it('Stopping → Error (cron sweep)', async () => {
      const { job_sequence_id } = await insertJobSequence('Stopping');
      await execute(sql.force_old_start_date, { id: job_sequence_id });
      await execute(sql.force_old_finish_date_with_status, {
        id: job_sequence_id,
        status: 'Error',
      });
      await execute(productionSql.error_abandoned_job_sequences);
      assert.equal(await selectStatus(job_sequence_id), 'Error');
    });

    it('Running → Error (cron sweep)', async () => {
      const { job_sequence_id } = await insertJobSequence('Running');
      await execute(sql.force_old_start_date, { id: job_sequence_id });
      await execute(sql.force_old_finish_date_with_status, {
        id: job_sequence_id,
        status: 'Error',
      });
      await execute(productionSql.error_abandoned_job_sequences);
      assert.equal(await selectStatus(job_sequence_id), 'Error');
    });
  });
});
