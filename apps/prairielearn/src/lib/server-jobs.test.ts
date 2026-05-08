import { afterAll, assert, beforeAll, describe, it } from 'vitest';

import { execute, loadSql, queryOptionalScalar, queryScalar } from '@prairielearn/postgres';
import { IdSchema } from '@prairielearn/zod';

import * as helperDb from '../tests/helperDb.js';

import { EnumJobStatusSchema } from './db-types.js';

// Load the production SQL blocks under test.
const sql = loadSql(new URL('server-jobs.sql', import.meta.url).pathname);

async function insertJobSequence(status: 'Running' | 'Stopping'): Promise<{
  job_sequence_id: string;
  job_id: string;
}> {
  const sequenceId = await queryOptionalScalar(
    `INSERT INTO job_sequences (number, type, description, legacy, status)
     VALUES (1, 'ai_grading', 'test', FALSE, $status::enum_job_status)
     RETURNING id`,
    { status },
    IdSchema,
  );
  if (sequenceId == null) throw new Error('Failed to insert job_sequence');
  const jobId = await queryOptionalScalar(
    `INSERT INTO jobs (job_sequence_id, number_in_sequence, last_in_sequence, type, description, status, heartbeat_at)
     VALUES ($job_sequence_id, 1, TRUE, 'ai_grading', 'test', 'Running', CURRENT_TIMESTAMP - INTERVAL '2 days')
     RETURNING id`,
    { job_sequence_id: sequenceId },
    IdSchema,
  );
  if (jobId == null) throw new Error('Failed to insert job');
  return { job_sequence_id: sequenceId, job_id: jobId };
}

async function selectStatus(job_sequence_id: string): Promise<string> {
  return await queryScalar(
    'SELECT status::text FROM job_sequences WHERE id = $job_sequence_id',
    { job_sequence_id },
    EnumJobStatusSchema,
  );
}

describe('server-jobs SQL transitions', () => {
  beforeAll(helperDb.before);
  afterAll(helperDb.after);

  describe('update_job_on_finish', () => {
    it('Running + Success → Success', async () => {
      const { job_sequence_id, job_id } = await insertJobSequence('Running');
      const result = await queryOptionalScalar(
        sql.update_job_on_finish,
        {
          job_sequence_id,
          job_id,
          output: '',
          data: {},
          status: 'Success',
        },
        EnumJobStatusSchema,
      );
      assert.equal(result, 'Success');
      assert.equal(await selectStatus(job_sequence_id), 'Success');
    });

    it('Stopping + Success → Stopped', async () => {
      const { job_sequence_id, job_id } = await insertJobSequence('Stopping');
      const result = await queryOptionalScalar(
        sql.update_job_on_finish,
        {
          job_sequence_id,
          job_id,
          output: '',
          data: {},
          status: 'Success',
        },
        EnumJobStatusSchema,
      );
      assert.equal(result, 'Stopped');
      assert.equal(await selectStatus(job_sequence_id), 'Stopped');
    });

    it('Stopping + Error → Error (preserves real failure)', async () => {
      const { job_sequence_id, job_id } = await insertJobSequence('Stopping');
      const result = await queryOptionalScalar(
        sql.update_job_on_finish,
        {
          job_sequence_id,
          job_id,
          output: '',
          data: {},
          status: 'Error',
        },
        EnumJobStatusSchema,
      );
      assert.equal(result, 'Error');
      assert.equal(await selectStatus(job_sequence_id), 'Error');
    });

    it('Already terminal → no row returned (idempotent)', async () => {
      const { job_sequence_id, job_id } = await insertJobSequence('Running');
      // First call settles the sequence.
      await execute(sql.update_job_on_finish, {
        job_sequence_id,
        job_id,
        output: '',
        data: {},
        status: 'Success',
      });
      // Second call must not double-update.
      const result = await queryOptionalScalar(
        sql.update_job_on_finish,
        {
          job_sequence_id,
          job_id,
          output: '',
          data: {},
          status: 'Success',
        },
        EnumJobStatusSchema,
      );
      assert.isNull(result);
    });
  });

  describe('update_job_on_error', () => {
    it('Stopping → Error (preserve worker failure signal)', async () => {
      const { job_sequence_id, job_id } = await insertJobSequence('Stopping');
      await execute(sql.update_job_on_error, {
        job_id,
        output: null,
        error_message: 'abandoned',
      });
      assert.equal(await selectStatus(job_sequence_id), 'Error');
    });

    it('Running → Error', async () => {
      const { job_sequence_id, job_id } = await insertJobSequence('Running');
      await execute(sql.update_job_on_error, {
        job_id,
        output: null,
        error_message: 'abandoned',
      });
      assert.equal(await selectStatus(job_sequence_id), 'Error');
    });

    it("doesn't overwrite an already-terminal sequence", async () => {
      // Reproduces the race where aiGrade's stop branch landed Stopped on
      // the sequence while the inner job was still Running, and the
      // abandoned-job sweeper would otherwise clobber it back to Error.
      const { job_sequence_id, job_id } = await insertJobSequence('Stopping');
      await execute("UPDATE job_sequences SET status = 'Stopped' WHERE id = $job_sequence_id", {
        job_sequence_id,
      });
      await execute(sql.update_job_on_error, {
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
      await execute(
        `UPDATE job_sequences SET start_date = CURRENT_TIMESTAMP - INTERVAL '2 days'
         WHERE id = $id`,
        { id: job_sequence_id },
      );
      await execute(
        `UPDATE jobs SET status = 'Error', finish_date = CURRENT_TIMESTAMP - INTERVAL '2 days'
         WHERE job_sequence_id = $id`,
        { id: job_sequence_id },
      );
      await execute(sql.error_abandoned_job_sequences);
      assert.equal(await selectStatus(job_sequence_id), 'Error');
    });

    it('Running → Error (cron sweep)', async () => {
      const { job_sequence_id } = await insertJobSequence('Running');
      await execute(
        `UPDATE job_sequences SET start_date = CURRENT_TIMESTAMP - INTERVAL '2 days'
         WHERE id = $id`,
        { id: job_sequence_id },
      );
      await execute(
        `UPDATE jobs SET status = 'Error', finish_date = CURRENT_TIMESTAMP - INTERVAL '2 days'
         WHERE job_sequence_id = $id`,
        { id: job_sequence_id },
      );
      await execute(sql.error_abandoned_job_sequences);
      assert.equal(await selectStatus(job_sequence_id), 'Error');
    });
  });
});
